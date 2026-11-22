import RULES from "../../data/game_rules.json";

export { RULES };

/* ───────────────────────── types ───────────────────────── */
export type Level = 1 | 2 | 3;
export type NodeId = keyof typeof RULES.nodes;
export type TileType = NodeId | "RACK" | "DOOR" | "OUT" | "AIR" | "SEA" | "RAIL";
export type Dock = "air" | "sea" | "rail";
export type Dir = 0 | 1 | 2 | 3; // E S W N
export type MergeMode = "auto" | "on" | "off";
export type LineMode = "tag_bypass" | "serial_only" | "parallel_array";
/** origin = starting warehouse (T1-14); regional = Regional Sorting Centre (T15-18, 2 floors, country exports). */
export type Site = "origin" | "regional";
export interface Floors { rows: number; cols: number; levels: number }
export type ShelfSize = keyof typeof RULES.racks;
/** Shelf buffer between the doors and each line: door → LDR → shelves → UNL → line. */
export interface BufferCfg { enabled: boolean; shelf: ShelfSize; windowMin: number; truckLoad: number }

export interface Cell { t: TileType; d: Dir }
export type Grid = Record<string, Cell>; // key "r,c"

export interface PlannerState {
  tier: number;
  inputDoors: number;
  budget: number;
  scannerLevel: Level;
  levelOverrides: Partial<Record<NodeId, Level>>;
  unlocked: NodeId[];
  preStickered: number;
  inputRate: number;
  mergeMode: MergeMode;
  dockDistance: number;
  outputs: Record<Dock, boolean>;
  /** Unlocked 10×10 slot ids ("slotRow,slotCol"); null = default order for the tier. */
  slots?: string[] | null;
  site?: Site;
  /** Regional floor size per level (estimate until measured in-game). */
  floors?: Floors;
  buffer?: BufferCfg;
  /** Hardware you already own (from a save import), credited against the BOM. */
  owned?: Partial<Record<TileType, number>>;
}

export interface Line {
  id: string;
  doors: number[];
  mode: LineMode;
  chain: NodeId[];
  sorts: Dock[];          // CTD stages after APV, one per special dock
  manualSort: boolean;    // docks enabled but CTD locked
}

export interface Throughput { line: string; input: number; capacity: number; utilization: number; bottleneck: string }
export interface BufferPlan { line: string; overflow: number; parcels: number; shelves: number; capacity: number }
export interface OutputSplit { input: number; processed: number; backlog: number; standard: number; air: number; sea: number; rail: number; reject: number }
/** qty = template needs; owned = already placed in your save; total = unit × (qty − owned), i.e. still to buy. */
export interface BomRow { id: TileType; name: string; qty: number; unit: number; total: number; owned?: number }

export interface Plan {
  lines: Line[];
  merged: boolean;
  pivot: boolean;
  grid: Grid;
  footprint: Footprint;
  fits: boolean;
  rowsNeeded: number;
  bom: BomRow[];
  cost: number;
  overBudget: boolean;
  throughput: Throughput[];
  flags: string[];
  reason: string;
  buffers: BufferPlan[];
}

/* ───────────────────────── constants ───────────────────────── */
export const SCANNERS: NodeId[] = ["SER", "WGT", "CNT", "CRG", "STP", "PRH"];
export const CATALOG: NodeId[] = ["TAG", "SER", "WGT", "CNT", "CRG", "STP", "PRH", "CID", "APV", "DNY", "CTD", "LDR"];
export const BASE_NODES: NodeId[] = ["CNV", "JNR", "BRG", "SPL", "PSR"];
export const LEVELED: NodeId[] = ["TAG", ...SCANNERS];
export const MANUAL_SCOPE: NodeId[] = [...SCANNERS, "APV", "DNY"];
export const RACK_COST = 500; // LDR + RACK + UNL ≈ $1,700/hop
export const MK: Record<Level, string> = { 1: "Mk.1", 2: "Mk.2", 3: "Mk.3" };

export const scanTime = (l: Level) => RULES.scan_speeds_sec[`lvl_${l}` as const];
export const perMin = (l: Level) => 60 / scanTime(l);
export const key = (r: number, c: number) => `${r},${c}`;

export const DEFAULT_STATE: PlannerState = {
  tier: 3,
  inputDoors: 2,
  budget: 10000,
  scannerLevel: 1,
  levelOverrides: {},
  unlocked: ["TAG", "SER", "WGT"],
  preStickered: 0.35,
  inputRate: 2.5,
  mergeMode: "auto",
  dockDistance: 0,
  outputs: { air: false, sea: false, rail: false },
  slots: null,
  site: "origin",
  buffer: { enabled: false, shelf: "XL", windowMin: 5, truckLoad: 20 },
};
export const DEFAULT_BUFFER: BufferCfg = { enabled: false, shelf: "XL", windowMin: 5, truckLoad: 20 };

export const REGIONAL_FLOORS: Floors = { cols: RULES.regional.floor_est[0], rows: RULES.regional.floor_est[1], levels: RULES.regional.levels };
export const REGIONAL_DEFAULT_STATE: PlannerState = {
  ...DEFAULT_STATE, site: "regional", tier: RULES.regional.tiers[0], inputDoors: 3, scannerLevel: 2,
  unlocked: ["SER", "WGT", "CNT", "CRG", "STP", "PRH", "CID", "APV", "DNY", "LDR", "CYD"],
  outputs: { air: false, sea: false, rail: false }, slots: null, floors: REGIONAL_FLOORS,
};
/** Game has 14 starting-warehouse tiles (BP_WarehouseTier) + regional unlock + 3 regional tiles (BP_WarehouseTier_Large) = T18. */
export const TIER_RANGE: Record<Site, [number, number]> = { origin: [1, RULES.max_tier_total], regional: [RULES.regional.tiers[0], RULES.regional.tiers[1]] };
/** Starting warehouse exposes a 5th inbound door at T14; regional door count is an estimate. */
export const maxDoors = (s: Pick<PlannerState, "tier" | "site">) =>
  s.site === "regional" ? RULES.regional.max_doors_est : s.tier >= RULES.grid.max_tier ? 5 : 4;
export const isEstimate = (t: TileType) => t in RULES.nodes && "est" in RULES.nodes[t as NodeId];
export const CATALOG_REGIONAL: NodeId[] = ["TAG", "SER", "WGT", "CNT", "CRG", "STP", "PRH", "CID", "APV", "DNY", "CYD", "LDR"];
export const catalogFor = (s: Pick<PlannerState, "site">) => (s.site === "regional" ? CATALOG_REGIONAL : CATALOG);
export const DOCKS: Dock[] = ["rail", "air", "sea"];
export const DOCK_TILE: Record<Dock, TileType> = { rail: "RAIL", air: "AIR", sea: "SEA" };
export const DOCK_SHARE: Record<Dock, number> = { rail: RULES.cargo_distribution.rail, air: RULES.cargo_distribution.air, sea: RULES.cargo_distribution.maritime };
export const bufferOf = (s: Pick<PlannerState, "buffer">): BufferCfg => ({ ...DEFAULT_BUFFER, ...(s.buffer ?? {}) });

export function tileCost(t: TileType): number {
  if (t === "RACK") return RACK_COST;
  if (t === "DOOR" || t === "OUT" || t === "AIR" || t === "SEA" || t === "RAIL") return 0;
  return RULES.nodes[t].cost;
}
export function tileName(t: TileType): string {
  if (t === "RACK") return "Rack (est.)";
  if (t === "DOOR") return "Input Door";
  if (t === "OUT") return "Standard Dock (road)";
  if (t === "RAIL") return "Rail Cargo Dock";
  if (t === "AIR") return "Air Cargo Dock";
  if (t === "SEA") return "Maritime Dock";
  return RULES.nodes[t].name;
}

export function effectiveUnlocked(s: PlannerState): NodeId[] {
  const u = new Set<NodeId>([...BASE_NODES, ...s.unlocked]);
  if (u.has("LDR")) u.add("UNL");
  return [...u];
}
export function levelOf(s: PlannerState, n: NodeId): Level {
  return s.levelOverrides[n] ?? s.scannerLevel;
}

/* ───────────────────────── footprint ───────────────────────── */
export interface Footprint { rows: number; cols: number; tiles: number; blocked: (r: number, c: number) => boolean }

/*
 * Game warehouse geometry (from the save's GridCellIdentifier numbering):
 * a 4×5 grid of 10×10 slots. Front block = slot cols 0-1 × rows 0-1 (20×20 units, holds the 10×20 base);
 * back block = slot cols 2-4 × rows 0-3 (30 wide × 40 deep). 2 base + 14 expansion slots = 1,600 units at T14.
 * Tier = number of expansions bought.
 */
export const SLOT = 10;
export const BASE_SLOTS = ["0,0", "1,0"];
export const EXPANSION_ORDER = ["0,1", "1,1", "0,2", "1,2", "2,2", "3,2", "0,3", "1,3", "2,3", "3,3", "0,4", "1,4", "2,4", "3,4"];
export const ALL_SLOTS = [...BASE_SLOTS, ...EXPANSION_ORDER];
export const slotOf = (r: number, c: number) => `${Math.floor(r / SLOT)},${Math.floor(c / SLOT)}`;
export function slotsFor(s: Pick<PlannerState, "tier" | "slots">): string[] {
  return s.slots?.length ? s.slots : [...BASE_SLOTS, ...EXPANSION_ORDER.slice(0, Math.max(0, Math.min(RULES.grid.max_tier, s.tier)))];
}

export interface Footprint { rows: number; cols: number; tiles: number; slots: string[]; blocked: (r: number, c: number) => boolean }

/** Bounding box of the unlocked slots; locked slots inside it are blocked. */
export function footprint(s: Pick<PlannerState, "tier" | "slots" | "site" | "floors">): Footprint {
  if (s.site === "regional") {
    const f = s.floors ?? REGIONAL_FLOORS;
    return { rows: f.rows, cols: f.cols, tiles: f.rows * f.cols, slots: [], blocked: () => false };
  }
  const slots = slotsFor(s);
  const open = new Set(slots);
  let rows = 0, cols = 0;
  for (const id of open) {
    const [sr, sc] = id.split(",").map(Number);
    rows = Math.max(rows, (sr + 1) * SLOT); cols = Math.max(cols, (sc + 1) * SLOT);
  }
  return { rows, cols, tiles: open.size * SLOT * SLOT, slots, blocked: (r, c) => !open.has(slotOf(r, c)) };
}

/**
 * Widest open rectangle, anchored at the top of a block start (col 0 = front block, col 20 = back block),
 * that is tall enough for `need` rows (else the largest one). Templates are laid out inside it.
 */
function templateRegion(fp: Footprint, need: number): { c0: number; rows: number; cols: number } {
  const cands: { c0: number; rows: number; cols: number }[] = [];
  for (const c0 of [0, 2 * SLOT]) {
    if (c0 >= fp.cols || fp.blocked(0, c0)) continue;
    for (let w = SLOT; c0 + w <= fp.cols; w += SLOT) {
      let h = 0;
      while (h < fp.rows && Array.from({ length: w / SLOT }, (_, i) => !fp.blocked(h, c0 + i * SLOT)).every(Boolean)) h += SLOT;
      if (!h) break;
      cands.push({ c0, rows: h, cols: w });
    }
  }
  if (fp.slots.length === 0) return { c0: 0, rows: fp.rows, cols: fp.cols }; // plain rectangle (regional floor)
  const tall = cands.filter((c) => c.rows >= need).sort((a, b) => b.cols - a.cols || a.c0 - b.c0);
  if (tall.length) return tall[0];
  return cands.sort((a, b) => b.rows * b.cols - a.rows * a.cols)[0] ?? { c0: 0, rows: 0, cols: 0 };
}

/* ───────────────────────── lines ───────────────────────── */
function chainFor(s: PlannerState, pivot: boolean, merged: boolean): { chain: NodeId[]; mode: LineMode; sorts: Dock[]; manualSort: boolean } {
  const u = effectiveUnlocked(s);
  const has = (n: NodeId) => u.includes(n);
  const scanners = SCANNERS.filter(has);
  const regional = s.site === "regional";
  const tail: NodeId[] = (["CID", "APV", ...(regional ? ["CYD"] : [])] as NodeId[]).filter(has);
  const wanted = regional ? [] : DOCKS.filter((d) => s.outputs?.[d]);
  const sorts = has("CTD") ? wanted : [];
  const manualSort = wanted.length > 0 && !has("CTD");
  if (pivot) return { mode: "parallel_array", chain: ["SPL", ...scanners, ...tail], sorts, manualSort };
  const tag = has("TAG");
  return {
    mode: tag ? "tag_bypass" : "serial_only",
    chain: [...(merged ? (["JNR"] as NodeId[]) : []), ...(tag ? (["TAG"] as NodeId[]) : []), ...scanners, ...tail],
    sorts, manualSort,
  };
}

export function buildLines(s: PlannerState, merge: boolean): Line[] {
  const pivot = s.tier >= 12;
  const lines: Line[] = [];
  if (pivot || !merge) {
    for (let d = 1; d <= s.inputDoors; d++) {
      lines.push({ id: `L${d}`, doors: [d], ...chainFor(s, pivot, false) });
    }
    return lines;
  }
  for (let d = 1; d <= s.inputDoors; d += 2) {
    const pair = d + 1 <= s.inputDoors;
    lines.push({ id: `L${lines.length + 1}`, doors: pair ? [d, d + 1] : [d], ...chainFor(s, false, pair) });
  }
  return lines;
}

/* ───────────────────────── blueprint template ───────────────────────── */
// tag_bypass: green, main, red, gap | serial_only: main, red, gap | pivot: [outlets], A, red, B, gap
// merged lines add a feeder row under the red spine. Sort outlets use the row under red (serial) or above A (pivot).
const rowsFor = (l: Line) =>
  (l.mode === "parallel_array" ? 4 + (l.sorts.length ? 1 : 0) : l.mode === "serial_only" ? 3 : 4) + (l.doors.length > 1 ? 1 : 0);
const lastRowUsed = (l: Line) =>
  rowsFor(l) - (l.mode !== "parallel_array" && l.sorts.length && l.doors.length === 1 ? 0 : 1);

export function layout(lines: Line[], s: PlannerState): { grid: Grid; fits: boolean; rowsNeeded: number } {
  const full = footprint(s);
  const rowsNeeded = lines.reduce((a, l, i) => a + (i === lines.length - 1 ? lastRowUsed(l) : rowsFor(l)), 0);
  const region = templateRegion(full, rowsNeeded);
  const C0 = region.c0;
  const fp = { rows: region.rows, cols: region.cols, blocked: (r: number, c: number) => full.blocked(r, c + C0) };
  const grid: Grid = {};
  const put = (r: number, c: number, t: TileType, d: Dir = 0) => {
    if (r < 0 || c < 0 || r >= fp.rows || c >= fp.cols || fp.blocked(r, c)) return false;
    grid[key(r, c + C0)] = { t, d };
    return true;
  };
  const u = effectiveUnlocked(s);
  const hasDny = u.includes("DNY");
  const ldr = s.dockDistance > 5 && u.includes("LDR");
  let r0 = 0;
  let fits = true;

  const runRow = (r: number, startC: number, nodes: NodeId[], spacing: number) => {
    const cols: number[] = [];
    let c = startC;
    for (const n of nodes) {
      if (spacing === 2) { put(r, c, "CNV", 0); c++; }
      put(r, c, n, 0); cols.push(c); c++;
    }
    return { cols, end: c };
  };
  const spacingFor = (n: number, start: number) => (start + n * 2 + 2 <= fp.cols ? 2 : 1);
  const finish = (r: number, from: number) => {
    let c = from;
    if (ldr) { put(r, c, "LDR", 0); c++; }
    for (; c < fp.cols - 1; c++) put(r, c, "CNV", 0);
    put(r, fp.cols - 1, "OUT", 0);
  };
  /** Red spine under the eject columns; ends at DNY one tile past the last eject. */
  const spine = (r: number, from: number, ejectCols: number[]) => {
    const to = ejectCols.length ? Math.max(...ejectCols) : from;
    for (let c = from; c <= to; c++) put(r, c, ejectCols.includes(c) ? "JNR" : "CNV", 0);
    if (hasDny) put(r, to + 1, "DNY", 0);
  };
  const isEject = (n: NodeId) => n === "TAG" || n === "CID" || SCANNERS.includes(n);
  const buf = bufferOf(s).enabled && u.includes("LDR");
  /** Shelf buffer inline on row r from column c: LDR → RACK → UNL. Returns the next free column. */
  const bufferAt = (r: number, c: number) => {
    if (!buf) return c;
    put(r, c, "LDR", 0); put(r, c + 1, "RACK", 0); put(r, c + 2, "UNL", 0);
    return c + 3;
  };

  for (const l of lines) {
    if (r0 + lastRowUsed(l) > fp.rows || fp.blocked(r0 + lastRowUsed(l) - 1, fp.cols - 1)) { fits = false; break; }

    if (l.mode === "parallel_array") {
      const top = l.sorts.length ? 1 : 0;
      const A = r0 + top, RED = A + 1, B = A + 2;
      const nodes = l.chain.filter((n) => n !== "SPL");
      put(RED, 0, "DOOR", 0);
      const s0 = bufferAt(RED, 1);
      put(RED, s0, "SPL", 0);
      put(A, s0, "CNV", 0); put(B, s0, "CNV", 0);
      const sp = spacingFor(nodes.length + l.sorts.length + 1, s0 + 1);
      const a = runRow(A, s0 + 1, nodes, sp);
      runRow(B, s0 + 1, nodes, sp);
      spine(RED, s0 + 1, a.cols.filter((_, i) => isEject(nodes[i])));
      // B climbs across the red row and re-merges into A
      let c = a.end;
      put(B, c, "CNV", 3); put(RED, c, "CNV", 3); put(A, c, "JNR", 0); c++;
      for (const d of l.sorts) {
        if (sp === 2) { put(A, c, "CNV", 0); c++; }
        put(A, c, "CTD", 0); put(r0, c, DOCK_TILE[d], 3); c++;
      }
      finish(A, c);
    } else {
      const merged = l.doors.length > 1;
      const g = l.mode === "tag_bypass";
      const main = g ? r0 + 1 : r0;
      const red = main + 1;
      put(main, 0, "DOOR", 0);
      let start = 1;
      if (merged) {
        put(red + 1, 0, "DOOR", 0);
        put(red + 1, 1, "CNV", 3);
        put(main, 1, "JNR", 0);
        start = 2;
      }
      start = bufferAt(main, start);
      const nodes = l.chain.filter((n) => n !== "JNR");
      const bypassMerge = g && l.sorts.length > 0;
      const sp = spacingFor(nodes.length + l.sorts.length + (bypassMerge ? 1 : 0), start);
      const m = runRow(main, start, nodes, sp);
      spine(red, start, m.cols.filter((_, i) => isEject(nodes[i])));
      if (merged) put(red, 1, "BRG", 3); // D2 feeder crosses the red spine
      let c = m.end;
      if (g) {
        const tagC = m.cols[nodes.indexOf("TAG")];
        put(r0, tagC, "CNV", 0); // TAG Valid exit (north)
        if (bypassMerge) {
          // already-stickered boxes rejoin after APV so they still get cargo-sorted
          for (let x = tagC + 1; x < c; x++) put(r0, x, "CNV", 0);
          put(r0, c, "CNV", 1); put(main, c, "JNR", 0); c++;
        } else {
          for (let x = tagC + 1; x < fp.cols - 1; x++) put(r0, x, "CNV", 0);
          put(r0, fp.cols - 1, "OUT", 0);
        }
      }
      for (const d of l.sorts) {
        if (sp === 2) { put(main, c, "CNV", 0); c++; }
        put(main, c, "CTD", 0); put(red, c, "CNV", 1); put(red + 1, c, DOCK_TILE[d], 1); c++;
      }
      finish(main, c);
    }
    r0 += rowsFor(l);
  }
  return { grid, fits, rowsNeeded };
}

export function bomFromGrid(grid: Grid, extras: Partial<Record<TileType, number>> = {}, rackUnit = RACK_COST): BomRow[] {
  const count: Partial<Record<TileType, number>> = { ...extras };
  for (const c of Object.values(grid)) count[c.t] = (count[c.t] ?? 0) + 1;
  return (Object.entries(count) as [TileType, number][])
    .filter(([t]) => !["DOOR", "OUT", "AIR", "SEA", "RAIL"].includes(t))
    .map(([id, qty]) => {
      const unit = id === "RACK" ? rackUnit : tileCost(id);
      return { id, name: tileName(id), qty, unit, total: unit * qty };
    })
    .sort((a, b) => b.total - a.total);
}

/* ───────────────────────── throughput ───────────────────────── */
function throughput(lines: Line[], s: PlannerState): Throughput[] {
  return lines.map((l) => {
    const input = l.doors.length * s.inputRate;
    const sc = l.chain.filter((n) => SCANNERS.includes(n));
    const chainCap = sc.length ? Math.min(...sc.map((n) => perMin(levelOf(s, n)))) : Infinity;
    if (l.mode === "parallel_array") {
      const cap = chainCap * 2;
      return { line: l.id, input, capacity: cap, utilization: input / cap, bottleneck: input > cap ? "SCANNER_ARRAYS" : "NONE" };
    }
    const tagCap = l.mode === "tag_bypass" ? perMin(levelOf(s, "TAG")) : Infinity;
    const share = l.mode === "tag_bypass" ? s.preStickered : 0;
    const chainLim = chainCap / Math.max(1e-9, 1 - share);
    const cap = Math.min(tagCap, chainLim);
    const bn = input <= cap ? "NONE" : tagCap <= chainLim ? "TAG" : "SCANNER_CHAIN";
    return { line: l.id, input, capacity: cap, utilization: input / cap, bottleneck: bn };
  });
}

/* ───────────────────────── output split ───────────────────────── */
export function outputSplit(s: PlannerState, p: Plan): OutputSplit {
  const dist = RULES.cargo_distribution;
  const input = s.inputDoors * s.inputRate;
  const processed = p.throughput.reduce((a, t) => a + Math.min(t.input, t.capacity), 0);
  const reject = processed * dist.invalid;
  const air = s.outputs.air ? processed * dist.air : 0;
  const sea = s.outputs.sea ? processed * dist.maritime : 0;
  const rail = s.outputs.rail ? processed * dist.rail : 0;
  return { input, processed, backlog: Math.max(0, input - processed), reject, air, sea, rail, standard: processed - reject - air - sea - rail };
}

/* ───────────────────────── shelf buffer ───────────────────────── */
/**
 * Shelves sized per line to hold (a) whatever the line can't keep up with over the delivery window,
 * plus (b) one truck load per door feeding it, so a truck dump never backs up onto the dock.
 */
export function bufferPlan(lines: Line[], s: PlannerState): BufferPlan[] {
  const b = bufferOf(s);
  const cap = RULES.racks[b.shelf].cap;
  return throughput(lines, s).map((t, i) => {
    const overflow = Math.max(0, t.input - t.capacity);
    const parcels = Math.ceil(overflow * b.windowMin + lines[i].doors.length * b.truckLoad);
    return { line: t.line, overflow, parcels, shelves: Math.max(1, Math.ceil(parcels / cap)), capacity: cap };
  });
}

/* ───────────────────────── plan ───────────────────────── */
function evaluate(s: PlannerState, merge: boolean) {
  const lines = buildLines(s, merge);
  const { grid, fits, rowsNeeded } = layout(lines, s);
  const u = effectiveUnlocked(s);
  const extras: Partial<Record<TileType, number>> = {};
  if (s.dockDistance > 5 && u.includes("LDR")) { extras.UNL = lines.length * (lines[0]?.mode === "parallel_array" ? 2 : 1); extras.RACK = extras.UNL; }
  else if (s.dockDistance > 0) extras.CNV = s.dockDistance * lines.length;
  const buffers = bufferPlan(lines, s);
  if (bufferOf(s).enabled && u.includes("LDR")) {
    // one RACK per line is drawn in the template; the rest of each line's shelves are extras
    extras.RACK = (extras.RACK ?? 0) + buffers.reduce((a, b) => a + Math.max(0, b.shelves - 1), 0);
  }
  const rackUnit = RULES.racks[bufferOf(s).shelf].cost;
  const bom = bomFromGrid(grid, extras, rackUnit).map((r) => {
    const owned = Math.min(r.qty, s.owned?.[r.id] ?? 0);
    return owned ? { ...r, owned, total: r.unit * (r.qty - owned) } : r;
  }).sort((a, b) => b.total - a.total);
  const cost = bom.reduce((a, b) => a + b.total, 0);
  return { lines, grid, fits, rowsNeeded, bom, cost, buffers };
}

export function plan(s: PlannerState): Plan {
  const pivot = s.tier >= 12;
  const canMerge = !pivot && s.inputDoors >= 2;
  const dedicated = evaluate(s, false);
  let pick = dedicated;
  let merged = false;
  let reason = pivot ? "Tier 12+ meta pivot: TAG dropped, each door split into mirrored A/B arrays" : "Dedicated line per door";
  if (canMerge) {
    if (s.mergeMode === "on") { pick = evaluate(s, true); merged = true; reason = "Forced merge: door pairs share one JNR bus"; }
    else if (s.mergeMode === "auto" && (dedicated.cost > s.budget || !dedicated.fits)) {
      pick = evaluate(s, true); merged = true;
      reason = !dedicated.fits
        ? `Merged: dedicated lines need ${dedicated.rowsNeeded} rows, footprint has ${footprint(s).rows}`
        : `Merged: dedicated lines $${dedicated.cost.toLocaleString()} > budget $${s.budget.toLocaleString()}`;
    } else if (s.mergeMode === "auto") reason = "Dedicated lines: budget and footprint allow one bus per door";
  }
  const tp = throughput(pick.lines, s);
  const u = effectiveUnlocked(s);
  const flags: string[] = [];
  if (pick.cost > s.budget) flags.push(`DEFER $${pick.cost.toLocaleString()}: short $${(pick.cost - s.budget).toLocaleString()}`);
  if (!pick.fits) flags.push(`Footprint overflow: need ${pick.rowsNeeded} rows`);
  if (tp.some((t) => t.bottleneck === "TAG")) flags.push("TAG saturated: upgrade TAG or split doors");
  if (tp.some((t) => t.bottleneck === "SCANNER_CHAIN" || t.bottleneck === "SCANNER_ARRAYS")) flags.push("Scanner chain saturated: upgrade lowest-level scanner");
  if (s.dockDistance > 5 && !u.includes("LDR")) flags.push("Dock >5 tiles: unlock LDR for teleport chain");
  const bc = bufferOf(s);
  const over = pick.buffers.reduce((a, b) => a + b.overflow, 0);
  if (bc.enabled && !u.includes("LDR")) flags.push("Shelf buffer needs LDR (unlocks UNL)");
  if (!bc.enabled && over > 0) flags.push(`Backlog ${over.toFixed(1)}/min: enable the shelf buffer`);
  if (!u.includes("APV")) flags.push("APV locked: approvals manual");
  if (!u.includes("DNY")) flags.push("DNY locked: rejects manual");
  if (s.site === "regional") {
    if (!u.includes("CYD")) flags.push("CYD locked: country exports routed by hand");
    flags.push("Regional floor size & door count are estimates: set them from your game");
  } else {
    if (pick.lines.some((l) => l.manualSort)) flags.push("CTD locked: air/sea pulled by hand");
    if (u.includes("CTD") && !DOCKS.some((d) => s.outputs[d])) flags.push("CTD unlocked: enable Rail/Air/Sea docks to auto-sort");
  }
  return {
    lines: pick.lines, merged, pivot, grid: pick.grid, footprint: footprint(s), fits: pick.fits,
    rowsNeeded: pick.rowsNeeded, bom: pick.bom, cost: pick.cost, overBudget: pick.cost > s.budget,
    throughput: tp, flags, reason, buffers: pick.buffers,
  };
}

/* ───────────────────────── topology text ───────────────────────── */
export function topologyText(p: Plan, s: PlannerState): string {
  const u = effectiveUnlocked(s);
  const out = s.dockDistance > 5 && u.includes("LDR") ? "~>[LDR~RACK~UNL]~>DOCK" : u.includes("APV") ? "->OUT" : "->MANUAL_APV";
  const sink = u.includes("DNY") ? "[DNY]" : "MANUAL_DNY";
  const o: string[] = [];
  for (const l of p.lines) {
    const doors = l.doors.map((d) => `D${d}`).join("+");
    const sortTxt = (l.manualSort ? ["[MANUAL_SORT]"] : l.sorts.map((d) => `[CTD>${d.toUpperCase()}]`)).join("->");
    const body = [l.chain.filter((n) => n !== "JNR" && n !== "SPL").map((n) => `[${n}]`).join("->"), sortTxt].filter(Boolean).join("->");
    if (l.mode === "parallel_array") {
      const arr = l.chain.filter((n) => n !== "SPL").map((n) => `[${n}]`).join("->");
      const pad = " ".repeat(l.id.length + doors.length + 8);
      o.push(`${l.id} ${doors}->[SPL]-a->${arr}-+`);
      o.push(`${pad} =R=>${sink}${" ".repeat(Math.max(1, arr.length - sink.length - 3))}+->[JNR]${sortTxt ? "->" + sortTxt : ""}${out}`);
      o.push(`${pad}-b->${arr}-+`);
    } else {
      const head = l.doors.length > 1 ? `${doors}->[JNR]->` : `${doors}->`;
      o.push(`${l.id} ${head}${body}${out}`);
      if (l.mode === "tag_bypass") o.push(`${" ".repeat(l.id.length + 1)}TAG:Valid==G==>${l.sorts.length ? "[JNR] before CTD" : "OUT"}`);
      o.push(`${" ".repeat(l.id.length + 1)}Invalid/Inspect->[JNR]==R==>${sink}`);
    }
  }
  return o.join("\n");
}

/* ───────────────────────── state schema ───────────────────────── */
export interface WarehouseState {
  tier: number;
  input_doors: number;
  budget?: number;
  unlocked_nodes: string[];
  scanner_levels: Record<string, number>;
  manual_checks_remaining: string[];
  output_docks?: string[];
  lines?: { id?: string; door: string; mode: string; chain: string[] }[];
  /** Unlocked 10×10 slots ("slotRow,slotCol"). */
  slots?: string[];
  /** Exact tile layout (e.g. decoded from a game save); replaces the template on import. */
  blueprint?: Grid;
  [k: string]: unknown;
}

export function toWarehouseState(s: PlannerState, p: Plan): WarehouseState {
  const u = effectiveUnlocked(s);
  const levels: Record<string, number> = {};
  for (const n of LEVELED) if (u.includes(n)) levels[n] = levelOf(s, n);
  return {
    tier: s.tier,
    input_doors: s.inputDoors,
    budget: s.budget,
    unlocked_nodes: ["CNV", "JNR", ...catalogFor(s).filter((n) => s.unlocked.includes(n)), ...(u.includes("UNL") ? ["UNL"] : [])],
    scanner_levels: levels,
    manual_checks_remaining: MANUAL_SCOPE.filter((n) => !u.includes(n)),
    output_docks: ["standard", ...DOCKS.filter((d) => s.outputs[d])],
    lines: p.lines.map((l) => ({ door: l.doors.join("+"), mode: l.mode, chain: [...l.chain, ...l.sorts.map(() => "CTD" as NodeId)] })),
    ...(s.site === "regional" ? { site: "regional", floors: s.floors ?? REGIONAL_FLOORS } : { slots: slotsFor(s) }),
    ...(s.owned && Object.keys(s.owned).length ? { owned: s.owned } : {}),
    ...(bufferOf(s).enabled ? { buffer: { shelf: bufferOf(s).shelf, window_min: bufferOf(s).windowMin, truck_load: bufferOf(s).truckLoad, shelves: p.buffers.reduce((a, b) => a + b.shelves, 0) } } : {}),
  };
}

function ownedFrom(x: unknown): Partial<Record<TileType, number>> | undefined {
  if (!x || typeof x !== "object") return undefined;
  const out: Partial<Record<TileType, number>> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if ((k in RULES.nodes || k === "RACK") && typeof v === "number" && v > 0) out[k as TileType] = Math.round(v);
  }
  return out;
}

function bufferFrom(x: unknown, base?: BufferCfg): BufferCfg {
  if (!x || typeof x !== "object") return base ?? DEFAULT_BUFFER;
  const b = x as Record<string, unknown>;
  const shelf = typeof b.shelf === "string" && b.shelf in RULES.racks ? (b.shelf as ShelfSize) : DEFAULT_BUFFER.shelf;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  return { enabled: true, shelf, windowMin: num(b.window_min, DEFAULT_BUFFER.windowMin), truckLoad: num(b.truck_load, DEFAULT_BUFFER.truckLoad) };
}

function floorsFrom(x: unknown): Floors {
  const f = (x ?? {}) as Partial<Floors>;
  const n = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  return { rows: n(f.rows, REGIONAL_FLOORS.rows, 10, 200), cols: n(f.cols, REGIONAL_FLOORS.cols, 10, 200), levels: n(f.levels, REGIONAL_FLOORS.levels, 1, 4) };
}

/** Accepts raw JSON, a ```json fence, or any text wrapping a single JSON object. */
export function parseStatePatch(text: string): WarehouseState {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("No JSON object found");
  const obj = JSON.parse(text.slice(a, b + 1));
  if (typeof obj !== "object" || obj === null || typeof obj.tier !== "number") throw new Error("Missing numeric `tier`");
  return obj as WarehouseState;
}

export function fromWarehouseState(w: WarehouseState, base: PlannerState): PlannerState {
  const valid = (n: string): n is NodeId => n in RULES.nodes;
  const site: Site = w.site === "regional" ? "regional" : w.site === "origin" ? "origin" : base.site ?? "origin";
  const unlocked = (w.unlocked_nodes ?? []).filter(valid).filter((n) => catalogFor({ site }).includes(n));
  const lv = Object.entries(w.scanner_levels ?? {}).filter(([n]) => valid(n)) as [NodeId, number][];
  const clamp = (x: number) => (Math.min(3, Math.max(1, Math.round(x))) as Level);
  const counts = new Map<number, number>();
  lv.forEach(([, v]) => counts.set(clamp(v), (counts.get(clamp(v)) ?? 0) + 1));
  const global = (lv.length ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : base.scannerLevel) as Level;
  const overrides: Partial<Record<NodeId, Level>> = {};
  lv.forEach(([n, v]) => { if (clamp(v) !== global) overrides[n] = clamp(v); });
  return {
    ...base,
    site,
    tier: Math.min(TIER_RANGE[site][1], Math.max(TIER_RANGE[site][0], w.tier)),
    inputDoors: Math.min(maxDoors({ site, tier: Math.min(TIER_RANGE[site][1], Math.max(TIER_RANGE[site][0], w.tier)) }), Math.max(1, w.input_doors ?? base.inputDoors)),
    budget: typeof w.budget === "number" ? w.budget : base.budget,
    unlocked: unlocked.length ? unlocked : base.unlocked,
    scannerLevel: global,
    levelOverrides: overrides,
    outputs: Array.isArray(w.output_docks)
      ? { air: w.output_docks.includes("air"), sea: w.output_docks.includes("sea") || w.output_docks.includes("maritime"), rail: w.output_docks.includes("rail") }
      : base.outputs,
    mergeMode: (w.lines ?? []).some((l) => String(l.door).includes("+")) ? "on" : base.mergeMode,
    slots: Array.isArray(w.slots) ? w.slots.filter((x) => ALL_SLOTS.includes(x)) : null,
    floors: site === "regional" ? floorsFrom(w.floors) : base.floors,
    buffer: bufferFrom(w.buffer, base.buffer),
    owned: ownedFrom(w.owned) ?? base.owned,
  };
}
