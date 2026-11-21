/**
 * Parcel Simulator save importer (Unreal Engine 5.4+ GVAS, uncompressed).
 * Reads %LOCALAPPDATA%\parcel\Saved\SaveGames\SaveN.sav in the browser and maps it to a WarehouseState.
 */
import { BASE_SLOTS, EXPANSION_ORDER, maxDoors, slotOf, type Dir, type Grid, type TileType, type WarehouseState } from "./engine";

type TypeName = { n: string; p: TypeName[] };
type Val = unknown;
type Obj = Record<string, Val>;

const NATIVE: Record<string, [string, number]> = {
  Vector: ["d", 3], Rotator: ["d", 3], Quat: ["d", 4], Vector2D: ["d", 2],
  LinearColor: ["f", 4], IntPoint: ["i", 2], Color: ["B", 4], DateTime: ["q", 1], Timespan: ["q", 1],
};

class Reader {
  o = 0;
  private v: DataView;
  private latin = new TextDecoder("latin1");
  private utf16 = new TextDecoder("utf-16le");
  private b: Uint8Array;
  constructor(b: Uint8Array) { this.b = b; this.v = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  get length() { return this.b.length; }
  i32() { const x = this.v.getInt32(this.o, true); this.o += 4; return x; }
  u32() { const x = this.v.getUint32(this.o, true); this.o += 4; return x; }
  u16() { const x = this.v.getUint16(this.o, true); this.o += 2; return x; }
  u8() { return this.b[this.o++]; }
  i64() { const x = Number(this.v.getBigInt64(this.o, true)); this.o += 8; return x; }
  f32() { const x = this.v.getFloat32(this.o, true); this.o += 4; return x; }
  f64() { const x = this.v.getFloat64(this.o, true); this.o += 8; return x; }
  raw(n: number) { const x = this.b.subarray(this.o, this.o + n); this.o += n; return x; }
  hex(n: number) { return Array.from(this.raw(n), (x) => x.toString(16).padStart(2, "0")).join(""); }
  fstr(): string {
    const n = this.i32();
    if (n === 0) return "";
    if (n < 0) return this.utf16.decode(this.raw(-n * 2)).replace(/\0+$/, "");
    return this.latin.decode(this.raw(n)).replace(/\0+$/, "");
  }
  tname(): TypeName {
    const n = this.fstr();
    const c = this.i32();
    return { n, p: Array.from({ length: c }, () => this.tname()) };
  }
}

function readHeader(r: Reader) {
  if (new TextDecoder().decode(r.raw(4)) !== "GVAS") throw new Error("Not an Unreal save (missing GVAS magic)");
  const saveVer = r.i32(); r.i32(); // package UE4 version
  if (saveVer >= 3) r.i32(); // UE5 package version
  r.u16(); r.u16(); r.u16(); r.u32(); const branch = r.fstr();
  r.i32(); const n = r.i32(); r.raw(n * 20); // custom versions
  const cls = r.fstr();
  if (saveVer >= 3) r.u8(); // UE 5.x: "save game was serialized with property tags" flag
  return { branch, cls };
}

function props(r: Reader, end: number): Obj {
  const out: Obj = {};
  while (r.o < end) {
    const name = r.fstr();
    if (!name || name === "None") break;
    const t = r.tname();
    const size = r.i32();
    const flags = r.u8();
    if (flags & 0x01) r.i32();
    if (flags & 0x02) r.raw(16);
    if (flags & 0x04) { const ext = r.u8(); if (ext & 0x02) r.u8(); }
    const start = r.o;
    let val: Val;
    if (t.n === "BoolProperty") val = Boolean(flags & 0x10);
    else {
      try { val = value(r, t, size); } catch { val = undefined; }
      r.o = start + size;
    }
    out[name.replace(/_\d+_[0-9A-F]{32}$/, "")] = val; // strip Blueprint GUID suffixes
  }
  return out;
}

function one(r: Reader, t: TypeName, size?: number): Val {
  switch (t.n) {
    case "IntProperty": return r.i32();
    case "UInt32Property": return r.u32();
    case "Int64Property": return r.i64();
    case "FloatProperty": return r.f32();
    case "DoubleProperty": return r.f64();
    case "BoolProperty": return Boolean(r.u8());
    case "StrProperty": case "NameProperty": case "ObjectProperty": case "EnumProperty": return r.fstr();
    case "SoftObjectProperty": { const v = r.fstr(); r.fstr(); return v; }
    case "ByteProperty": return t.p.length && t.p[0].n !== "None" && size !== 1 ? r.fstr() : r.u8();
    case "TextProperty": {
      r.i32(); const ht = r.u8();
      if (ht === 0xff) return r.i32() ? r.fstr() : "";
      if (ht === 0) { r.fstr(); r.fstr(); return r.fstr(); }
      throw new Error("text history " + ht);
    }
    case "StructProperty": {
      const sn = (t.p[0]?.n ?? "").split(/[./]/).pop() ?? "";
      if (sn === "Guid") return r.hex(16);
      const nat = NATIVE[sn];
      if (nat) {
        const [k, c] = nat;
        return Array.from({ length: c }, () => (k === "d" ? r.f64() : k === "f" ? r.f32() : k === "i" ? r.i32() : k === "q" ? r.i64() : r.u8()));
      }
      return props(r, r.length);
    }
  }
  throw new Error("unsupported " + t.n);
}

function value(r: Reader, t: TypeName, size: number): Val {
  if (t.n === "ArrayProperty") { const c = r.i32(); return Array.from({ length: c }, () => one(r, t.p[0])); }
  if (t.n === "SetProperty") { r.i32(); const c = r.i32(); return Array.from({ length: c }, () => one(r, t.p[0])); }
  if (t.n === "MapProperty") {
    r.i32(); const c = r.i32();
    return Array.from({ length: c }, () => { const k = one(r, t.p[0]); return [k, one(r, t.p[1])]; });
  }
  return one(r, t, size);
}

export function parseGvas(buf: ArrayBuffer): { header: { branch: string; cls: string }; root: Obj } {
  const r = new Reader(new Uint8Array(buf));
  const header = readHeader(r);
  return { header, root: props(r, r.length) };
}

/* ───────────── game → planner mapping ───────────── */

/** Blueprint class fragment → planner node id. Order matters (Joiner_3Way before Joiner, Unloader before Loader). */
const CLASS_MAP: [string, string][] = [
  ["Joiner_3Way", "JNR"], ["Joiner", "JNR"], ["Bridger", "BRG"], ["Splitter", "SPL"], ["Pauser", "PSR"],
  ["Unloader", "UNL"], ["Loader", "LDR"], ["Scanner2", "TAG"],
  ["CriteriaScanner_SerialNumber", "SER"], ["CriteriaScanner_Weight", "WGT"], ["CriteriaScanner_Country", "CNT"],
  ["CriteriaScanner_CargoType", "CRG"], ["CriteriaScanner_Stamp", "STP"], ["CriteriaScanner_ContentsProhibited", "PRH"],
  ["ContentsInspection", "CID"], ["StickerApplier_Approve", "APV"], ["StickerApplier_Deny", "DNY"],
  ["CargoTypeDiverter", "CTD"], ["Diverter", "CTD"], ["Straight", "CNV"], ["Corner", "CNV"],
];
const LEVELED = ["TAG", "SER", "WGT", "CNT", "CRG", "STP", "PRH"];
const SCANNERS = ["SER", "WGT", "CNT", "CRG", "STP", "PRH"];

export interface SaveSummary {
  money: number;
  incomeToday: number;
  expansions: number;
  doors: string[];
  placed: Record<string, number>;
  levels: Record<string, number[]>;
}

/** Game grid cell id → [row, col]. Front block: 20 rows per column (cols 0-19); back block: 40 rows per column from col 20. */
export function cellToRC(id: number): [number, number] {
  return id < 400 ? [id % 20, Math.floor(id / 20)] : [(id - 400) % 40, 20 + Math.floor((id - 400) / 40)];
}

/**
 * Belt forward = actor +Y, flipped when the part is mirrored (Scale3D.Y < 0).
 * World +X = east (col+), +Y = south (row+): yaw 0 → S, 90 → W, 180 → N, 270 → E (before mirroring).
 */
function dirFromTransform(tf: Obj): Dir {
  const [x, y, z, w] = Array.isArray(tf.Rotation) ? (tf.Rotation as number[]) : [0, 0, 0, 1];
  const mirrored = Array.isArray(tf.Scale3D) && (tf.Scale3D as number[])[1] < 0;
  const yaw = (Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * 180) / Math.PI;
  return ((((Math.round(yaw / 90) + 1 + (mirrored ? 2 : 0)) % 4) + 4) % 4) as Dir;
}

function collect(o: unknown, keyName: string, out: string[] = []): string[] {
  if (Array.isArray(o)) o.forEach((v) => collect(v, keyName, out));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === keyName && typeof v === "string") out.push(v); else collect(v, keyName, out); }
  return out;
}

export function saveToWarehouseState(buf: ArrayBuffer): { state: WarehouseState; summary: SaveSummary } {
  const { header, root } = parseGvas(buf);
  if (!header.cls.includes("ParcelSaveGame")) throw new Error(`Not a Parcel Simulator save (${header.cls})`);

  const upgrades = new Map((root.InteractableGuidToUpgradeTier as [string, number][] | undefined) ?? []);
  const placed: Record<string, number> = {};
  const levels: Record<string, number[]> = {};
  const blueprint: Grid = {};
  const used = new Set<string>();
  let origin: [number, number] | null = null; // world X/Y of cell (0,0)
  for (const it of (root.InteractablesToSpawn as Obj[] | undefined) ?? []) {
    const cls = String(it.InteractableClass ?? "");
    const hit = CLASS_MAP.find(([frag]) => cls.includes(frag));
    if (!hit || !cls.includes("ConveyorBelt")) continue;
    const id = hit[1];
    placed[id] = (placed[id] ?? 0) + 1;
    (levels[id] ??= []).push(upgrades.get(String(it.InteractableGUID)) ?? 1); // no entry = base Mk.1
    const cell = Number.parseInt(String(it.GridCellIdentifier ?? ""), 10);
    if (Number.isNaN(cell)) continue;
    const [r, c] = cellToRC(cell);
    const tf = (it.Transform ?? {}) as Obj;
    const pos = tf.Translation as number[] | undefined;
    if (!origin && pos) origin = [pos[0] - c * 100, pos[1] - r * 100];
    blueprint[`${r},${c}`] = { t: id as TileType, d: dirFromTransform(tf) };
    used.add(slotOf(r, c));
  }
  // Storage racks have no grid cell; place them from world position.
  if (origin) {
    for (const e of (root.StorageRacksAndParcels as Obj[] | undefined) ?? []) {
      const info = (e.InteractableToSaveInfo ?? {}) as Obj;
      const pos = ((info.Transform ?? {}) as Obj).Translation as number[] | undefined;
      if (!pos) continue;
      const r = Math.round((pos[1] - origin[1]) / 100), c = Math.round((pos[0] - origin[0]) / 100);
      if (r < 0 || c < 0 || r >= 40 || c >= 50) continue;
      used.add(slotOf(r, c));
      if (!blueprint[`${r},${c}`]) blueprint[`${r},${c}`] = { t: "RACK", d: 0 };
    }
  }

  const expansions = ((root.UnlockedTileObjectNames as string[] | undefined) ?? []).filter((n) => n.startsWith("BP_WarehouseTier")).length;
  // Slots with machines on them are certainly unlocked; fill the rest of the tier count in default order.
  const slots = [...BASE_SLOTS, ...EXPANSION_ORDER.filter((x) => used.has(x))];
  for (const x of EXPANSION_ORDER) if (slots.length - BASE_SLOTS.length < expansions && !slots.includes(x)) slots.push(x);

  const doorsSeen = [...new Set(collect(root.Parcels, "DeliveryManagerName"))].sort();
  const tier = Math.min(14, Math.max(1, expansions));
  const doors = Math.min(maxDoors({ tier, site: "origin" }), Math.max(1, doorsSeen.length || (placed.TAG ?? 1)));
  const scanner_levels: Record<string, number> = {};
  for (const n of LEVELED) if (levels[n]) scanner_levels[n] = Math.min(...levels[n]); // slowest unit sets the pace
  const unlocked = ["CNV", "JNR", ...Object.keys(placed).filter((n) => n !== "CNV" && n !== "JNR")];

  const state: WarehouseState = {
    site: "origin",
    tier, // tier = expansions bought
    input_doors: doors,
    budget: Number(root.MoneyTotal ?? 0),
    unlocked_nodes: [...new Set(unlocked)],
    scanner_levels,
    manual_checks_remaining: [...SCANNERS, "CID", "APV", "DNY"].filter((n) => !placed[n]),
    output_docks: ["standard"],
    lines: [{ door: Array.from({ length: doors }, (_, i) => i + 1).join("+"), mode: placed.TAG ? "tag_bypass" : "serial_only",
      chain: ["JNR", "TAG", ...SCANNERS, "CID", "APV", "DNY"].filter((n) => placed[n]) }],
    slots,
    blueprint,
    source: "Save.sav",
    owned: placed,
  };
  return {
    state,
    summary: { money: state.budget ?? 0, incomeToday: Number(root.ParcelIncomeToday ?? 0), expansions, doors: doorsSeen, placed, levels },
  };
}
