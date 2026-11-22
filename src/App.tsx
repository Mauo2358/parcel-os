import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Archive, Check, ChevronRight, ClipboardCopy, Cpu, DoorOpen, Download, GitMerge, Layers, Plane, RotateCcw, Ship, Split, TrainFront, Truck, Upload } from "lucide-react";
import Blueprint, { tileClass } from "./components/Blueprint";
import ImportModal from "./components/ImportModal";
import FlowDiagram from "./components/FlowDiagram";
import PreStickered from "./components/PreStickered";
import {
  DEFAULT_STATE, LEVELED, MK, RULES, BASE_SLOTS, REGIONAL_DEFAULT_STATE, REGIONAL_FLOORS, TIER_RANGE, catalogFor, effectiveUnlocked, fromWarehouseState,
  DOCKS, DOCK_SHARE, bufferOf, isEstimate, maxDoors, slotsFor, levelOf, outputSplit, perMin, plan, scanTime,
  topologyText, toWarehouseState, type BufferCfg, type Floors, type Grid, type ShelfSize, type Level, type Line, type MergeMode, type NodeId, type PlannerState, type Site, type WarehouseState,
} from "./lib/engine";

/** Per-site storage. The starting warehouse keeps the original keys so existing plans survive. */
const KEYS: Record<Site, { state: string; grid: string }> = {
  origin: { state: "parcelos.state.v3", grid: "parcelos.grid.v3" },
  regional: { state: "parcelos.state.regional.v1", grid: "parcelos.grid.regional.v1" },
};
const LS_SITE = "parcelos.site";
const SITES: { v: Site; l: string }[] = [
  { v: "origin", l: "Starting Warehouse · T1–14" },
  { v: "regional", l: "Regional Sorting Centre · T15–18" },
];
const defaultsFor = (site: Site) => (site === "regional" ? REGIONAL_DEFAULT_STATE : DEFAULT_STATE);
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const money = (n: number) => "$" + Math.round(n).toLocaleString();

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; l: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button key={String(o.v)} className={`btn flex-1 ${value === o.v ? "btn-on" : ""}`} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

function Field({ label, children, right }: { label: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between"><span className="label">{label}</span>{right && <span className="text-[11px] text-bay-300">{right}</span>}</div>
      {children}
    </div>
  );
}

function CopyBtn({ text, label, icon }: { text: string; label: string; icon?: ReactNode }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); } catch { /* clipboard blocked */ } }}>
      {ok ? <Check size={14} className="text-valid" /> : icon ?? <ClipboardCopy size={14} />} {ok ? "Copied" : label}
    </button>
  );
}

function Chip({ id, sub }: { id: string; sub?: string }) {
  const cls = id in RULES.nodes || id === "DOOR" || id === "OUT" ? tileClass(id as NodeId) : "bg-bay-800 text-bay-300";
  return (
    <span className={`inline-flex flex-col items-center px-2 py-1 text-[11px] font-bold leading-tight ${cls}`}>
      {id}{sub && <span className="text-[9px] font-normal opacity-80">{sub}</span>}
    </span>
  );
}

function LineStages({ line, s }: { line: Line; s: PlannerState }) {
  const u = effectiveUnlocked(s);
  const nodes = line.chain.filter((n) => n !== "JNR" && n !== "SPL");
  const end = u.includes("APV") ? "OUT" : "MANUAL";
  const sub = (n: NodeId) => (LEVELED.includes(n) ? `${MK[levelOf(s, n)]}` : undefined);
  const row = (tag?: string) => (
    <div className="flex flex-wrap items-center gap-1">
      {tag && <span className="w-4 text-[10px] text-bay-500">{tag}</span>}
      {nodes.map((n, i) => (
        <Fragment key={n + i}>{i > 0 && <ChevronRight size={12} className="text-bay-500" />}<Chip id={n} sub={sub(n)} /></Fragment>
      ))}
      <ChevronRight size={12} className="text-bay-500" /><Chip id={end} />
    </div>
  );
  return (
    <div className="border border-bay-700 bg-bay-950 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px]">
        <span className="text-hazard">{line.id}</span>
        {line.doors.map((d) => <span key={d} className="inline-flex items-center gap-1 bg-bay-100 px-1.5 text-black"><DoorOpen size={11} />D{d}</span>)}
        {line.doors.length > 1 && <span className="inline-flex items-center gap-1 text-violet-300"><GitMerge size={12} /> JNR merge</span>}
        {line.mode === "parallel_array" && <span className="inline-flex items-center gap-1 text-violet-300"><Split size={12} /> SPL → A/B mirror</span>}
        <span className="ml-auto text-bay-500">{line.mode}</span>
      </div>
      {line.mode === "parallel_array" ? (
        <div className="space-y-1">
          {row("A")}
          <div className="ml-5 h-1.5 bg-reject/70" title="Shared Red Reject Spine" />
          {row("B")}
        </div>
      ) : (
        <div className="space-y-1">
          {line.mode === "tag_bypass" && <div className="flex items-center gap-2"><div className="h-1.5 flex-1 bg-valid/70" /><span className="text-[10px] text-valid">GREEN BYPASS · TAG Valid → OUT</span></div>}
          {row()}
          <div className="flex items-center gap-2"><div className="h-1.5 flex-1 bg-reject/70" /><span className="text-[10px] text-reject">RED SPINE · Invalid → {u.includes("DNY") ? "DNY" : "MANUAL"}</span></div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [site, setSite] = useState<Site>(() => (load<Site>(LS_SITE, "origin") === "regional" ? "regional" : "origin"));
  useEffect(() => save(LS_SITE, site), [site]);
  return <Planner key={site} site={site} onSite={setSite} />;
}

function Planner({ site, onSite }: { site: Site; onSite: (s: Site) => void }) {
  const K = KEYS[site];
  const D = defaultsFor(site);
  const [s, setS] = useState<PlannerState>(() => { const saved = load<Partial<PlannerState>>(K.state, {}); return { ...D, ...saved, site, outputs: { ...D.outputs, ...saved.outputs } }; });
  const p = useMemo(() => plan(s), [s]);
  // One grid per floor (the starting warehouse has one floor; stored as a plain Grid for backward compatibility).
  const [grids, setGrids] = useState<Grid[]>(() => {
    const raw = load<Grid | Grid[] | null>(K.grid, null);
    if (Array.isArray(raw)) return raw;
    if (raw) return [raw];
    return [plan({ ...D, ...load<Partial<PlannerState>>(K.state, {}), site }).grid];
  });
  const [floor, setFloor] = useState(0);
  const levels = site === "regional" ? (s.floors ?? REGIONAL_FLOORS).levels : 1;
  const grid = grids[Math.min(floor, levels - 1)] ?? {};
  const setGrid = (g: Grid | ((g: Grid) => Grid)) => setGrids((all) => {
    const next = [...all];
    const i = Math.min(floor, levels - 1);
    next[i] = typeof g === "function" ? g(next[i] ?? {}) : g;
    return next;
  });
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => save(K.state, s), [s, K.state]);
  useEffect(() => save(K.grid, site === "origin" ? grids[0] ?? {} : grids), [grids, site, K.grid]);
  // Drop doors that the tier no longer exposes (e.g. D5 below T14).
  useEffect(() => { if (s.inputDoors > maxDoors(s)) setS((x) => ({ ...x, inputDoors: maxDoors(x) })); }, [s]);

  const set = <K extends keyof PlannerState>(k: K) => (v: PlannerState[K]) => setS((x) => ({ ...x, [k]: v }));
  const ws = useMemo(() => toWarehouseState(s, p), [s, p]);
  const minified = JSON.stringify(ws);
  const topo = topologyText(p, s);
  const split = useMemo(() => outputSplit(s, p), [s, p]);
  const ctd = effectiveUnlocked(s).includes("CTD");
  const catalog = catalogFor(s);
  const [tMin, tMax] = TIER_RANGE[site];
  const buf = bufferOf(s);
  const setBuf = (patch: Partial<BufferCfg>) => setS((x) => ({ ...x, buffer: { ...bufferOf(x), ...patch } }));
  const remaining = s.budget - p.cost;
  const setFloors = (k: keyof Floors) => (v: number) => setS((x) => ({ ...x, floors: { ...(x.floors ?? REGIONAL_FLOORS), [k]: v } }));
  const rate = (n: number) => `${n.toFixed(1)}/min`;

  const toggle = (n: NodeId) => setS((x) => {
    const on = x.unlocked.includes(n);
    const levelOverrides = { ...x.levelOverrides };
    if (on) delete levelOverrides[n];
    return { ...x, unlocked: on ? x.unlocked.filter((y) => y !== n) : [...x.unlocked, n], levelOverrides };
  });
  const toggleSlot = (id: string) => setS((x) => {
    if (BASE_SLOTS.includes(id)) return x;
    const cur = slotsFor(x);
    const slots = cur.includes(id) ? cur.filter((y) => y !== id) : [...cur, id];
    return { ...x, slots, tier: Math.max(tMin, Math.min(tMax, slots.length - BASE_SLOTS.length)) };
  });
  const override = (n: NodeId, v: Level | 0) => setS((x) => {
    const levelOverrides = { ...x.levelOverrides };
    if (v === 0) delete levelOverrides[n]; else levelOverrides[n] = v;
    return { ...x, levelOverrides };
  });
  const applyPatch = (w: WarehouseState) => {
    const next = fromWarehouseState(w, s);
    if ((next.site ?? "origin") !== site) {
      // Patch targets the other site: store it there and switch.
      save(KEYS[next.site ?? "origin"].state, next);
      const g = w.blueprint && typeof w.blueprint === "object" ? w.blueprint : plan(next).grid;
      save(KEYS[next.site ?? "origin"].grid, next.site === "regional" ? [g] : g);
      onSite(next.site ?? "origin");
      return;
    }
    setS(next);
    setGrids([w.blueprint && typeof w.blueprint === "object" ? w.blueprint : plan(next).grid]);
    setFloor(0);
  };
  const reset = () => { setS(D); setGrids([plan(D).grid]); setFloor(0); };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(ws, null, 2) + "\n"], { type: "application/json" }));
    a.download = "warehouse_state.json"; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="min-h-screen">
      <header className="hazard-stripe flex flex-wrap items-center justify-between gap-3 border-b border-bay-700 px-5 py-3">
        <div className="flex items-center gap-3">
          <Cpu className="text-hazard" size={22} />
          <div>
            <div className="text-lg font-bold tracking-[0.2em] text-hazard">PARCEL-OS</div>
            <div className="text-[11px] text-bay-500">// Assembly Line Planner</div>
          </div>
          <select value={site} onChange={(e) => onSite(e.target.value as Site)} aria-label="Warehouse"
            className="ml-2 border border-hazard/60 bg-bay-950 px-2 py-1.5 text-[11px] font-bold tracking-widest text-hazard outline-none focus:border-hazard">
            {SITES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-bay-500">
          <span>TIER <b className="text-bay-100">{s.tier}</b>/{tMax}</span>
          <span>DOORS <b className="text-bay-100">{s.inputDoors}</b></span>
          <span>LINES <b className="text-bay-100">{p.lines.length}</b></span>
          <span>MODE <b className={p.pivot ? "text-hazard" : p.merged ? "text-violet-300" : "text-valid"}>{p.pivot ? "META PIVOT" : p.merged ? "MERGED BUS" : "DEDICATED"}</b></span>
          <span>BOM <b className="text-bay-100">{money(p.cost)}</b></span>
          <span>BUDGET <b className="text-bay-100">{money(s.budget)}</b> → <b className={remaining < 0 ? "text-reject" : "text-valid"}>{remaining < 0 ? "−" : ""}{money(Math.abs(remaining))}</b> left</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CopyBtn text={minified} label="Copy state" />
          <button className="btn" onClick={() => setImportOpen(true)}><Upload size={14} /> Import</button>
          <button className="btn" onClick={download} title="Download warehouse_state.json"><Download size={14} /></button>
          <button className="btn" onClick={reset} title="Reset to warehouse_state.json defaults"><RotateCcw size={14} /></button>
        </div>
      </header>

      <main className="grid items-start gap-4 p-4 lg:grid-cols-[330px_1fr]">
        <aside className="panel scroll-thin p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto">
          <h2 className="mb-4 flex items-center gap-2 border-b border-dashed border-bay-700 pb-2 text-[11px] tracking-[0.2em] text-hazard"><Layers size={13} /> CONTROLS</h2>

          <Field label="Warehouse tier" right={`${p.footprint.rows}×${p.footprint.cols} · ${p.footprint.tiles * levels} tiles${levels > 1 ? ` · ${levels} floors` : ""}`}>
            <input type="range" min={tMin} max={tMax} value={s.tier} onChange={(e) => setS((x) => ({ ...x, tier: Number(e.target.value), slots: null }))} className="w-full accent-hazard" />
            <div className="flex justify-between text-[10px] text-bay-500"><span>{tMin}</span><b className="text-bay-100">T{s.tier}</b>{site === "origin" ? <span className="text-hazard">12+ pivot · D5 @14 · 15+ regional</span> : <span className="text-hazard">country sorting</span>}<span>{tMax}</span></div>
          </Field>

          {site === "regional" && (
            <Field label="Regional floor (per level)" right={<span className="text-hazard" title="Not published anywhere yet: measure in-game (1 unit = 1 belt) and enter here">estimate</span>}>
              <div className="grid grid-cols-3 gap-2">
                {([["cols", "Width"], ["rows", "Depth"], ["levels", "Floors"]] as const).map(([k, l]) => (
                  <label key={k}><span className="label">{l}</span>
                    <input type="number" min={k === "levels" ? 1 : 10} max={k === "levels" ? 4 : 200} step={k === "levels" ? 1 : 10} value={(s.floors ?? REGIONAL_FLOORS)[k]}
                      onChange={(e) => setFloors(k)(Math.max(k === "levels" ? 1 : 10, Math.min(k === "levels" ? 4 : 200, Number(e.target.value) || 0)))}
                      className="w-full border border-bay-700 bg-bay-950 px-2 py-1.5 outline-none focus:border-hazard" />
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-bay-500">Default ≈ 5× the starting warehouse over 2 floors. 12 country exports.</p>
            </Field>
          )}

          <Field label="Active input doors" right={site === "origin" ? (s.tier >= RULES.grid.max_tier ? "5 at T14" : "D5 unlocks at T14") : <span className="text-hazard">count est.</span>}>
            <Seg value={s.inputDoors} onChange={set("inputDoors")} options={Array.from({ length: maxDoors(s) }, (_, i) => ({ v: i + 1, l: `D${i + 1}` }))} />
          </Field>

          <Field label="Scanner upgrade level" right={`${perMin(s.scannerLevel)} box/min/chain`}>
            <Seg value={s.scannerLevel} onChange={set("scannerLevel")} options={([1, 2, 3] as Level[]).map((v) => ({ v, l: <span>{MK[v]} <span className="text-bay-500">{scanTime(v)}s</span></span> }))} />
          </Field>

          {!p.pivot && s.inputDoors >= 2 && (
            <Field label="Door merge (JNR bus)">
              <Seg<MergeMode> value={s.mergeMode} onChange={set("mergeMode")} options={[{ v: "auto", l: "Auto" }, { v: "on", l: "Merge" }, { v: "off", l: "Dedicated" }]} />
            </Field>
          )}

          <div className="mb-4 grid grid-cols-2 gap-2">
            <label><span className="label">Budget $ <span className={remaining < 0 ? "text-reject" : "text-valid"} title="Budget minus the current [BOM] total">({remaining < 0 ? "−" : ""}{money(Math.abs(remaining))} after BOM)</span></span>
              <input type="number" min={0} step={500} value={s.budget} onChange={(e) => set("budget")(Math.max(0, Number(e.target.value) || 0))} className="w-full border border-bay-700 bg-bay-950 px-2 py-1.5 outline-none focus:border-hazard" />
            </label>
            <label><span className="label">Box/min/door</span>
              <input type="number" min={0} step={0.5} value={s.inputRate} onChange={(e) => set("inputRate")(Math.max(0, Number(e.target.value) || 0))} className="w-full border border-bay-700 bg-bay-950 px-2 py-1.5 outline-none focus:border-hazard" />
            </label>
            <label><span className="label">Dock dist (tiles)</span>
              <input type="number" min={0} value={s.dockDistance} onChange={(e) => set("dockDistance")(Math.max(0, Number(e.target.value) || 0))} className="w-full border border-bay-700 bg-bay-950 px-2 py-1.5 outline-none focus:border-hazard" />
            </label>
          </div>

          {!p.pivot && <PreStickered value={s.preStickered} onChange={set("preStickered")} />}

          {site === "origin" && <Field label="Output docks" right={ctd ? "sorted by CTD" : DOCKS.some((d) => s.outputs[d]) ? <span className="text-hazard">CTD locked · manual</span> : undefined}>
            <div className="grid grid-cols-4 gap-1">
              <div className="flex flex-col items-center gap-0.5 border border-valid/60 bg-valid/10 px-1 py-1.5 text-valid" title="Approved road parcels (plus any cargo type whose dock is off). Always on.">
                <span className="flex items-center gap-1 text-[11px] font-bold"><Truck size={13} /> STD</span>
                <span className="text-[10px]">{rate(split.standard)}</span>
              </div>
              {([["rail", TrainFront, "text-amber-300 border-amber-400/60 bg-amber-400/10", "Rail cargo"], ["air", Plane, "text-air border-air/60 bg-air/10", "Air cargo"], ["sea", Ship, "text-sea border-sea/60 bg-sea/10", "Maritime"]] as const).map(([d, Icon, on, label]) => (
                <button key={d} onClick={() => set("outputs")({ ...s.outputs, [d]: !s.outputs[d] })}
                  className={`flex flex-col items-center gap-0.5 border px-1 py-1.5 ${s.outputs[d] ? on : "border-bay-700 text-bay-500 hover:border-bay-500"}`}
                  title={`${label} dock: ${Math.round(DOCK_SHARE[d] * 100)}% of volume. Needs one CTD per line.`}>
                  <span className="flex items-center gap-1 text-[11px] font-bold"><Icon size={13} /> {d.toUpperCase()}</span>
                  <span className="text-[10px]">{s.outputs[d] ? rate(split[d]) : "off → STD"}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-bay-500">Rejects {rate(split.reject)} → {effectiveUnlocked(s).includes("DNY") ? "DNY" : "manual deny"}</p>
          </Field>}
          {site === "regional" && (
            <Field label="Country exports" right={effectiveUnlocked(s).includes("CYD") ? "sorted by CYD" : <span className="text-hazard">CYD locked · manual</span>}>
              <p className="text-[11px] text-bay-300">Approved {rate(split.standard)} → Country Diverter → {RULES.regional.countries} programmable export doors (schedule changes weekly).</p>
              <p className="mt-1 text-[10px] text-bay-500">Rejects {rate(split.reject)} → {effectiveUnlocked(s).includes("DNY") ? "DNY" : "manual deny"}</p>
            </Field>
          )}

          <Field label="Shelf buffer" right={
            <button onClick={() => setBuf({ enabled: !buf.enabled })} className={`btn px-2 py-0.5 text-[10px] ${buf.enabled ? "btn-on" : ""}`}>
              <Archive size={11} /> {buf.enabled ? "ON" : "OFF"}
            </button>}>
            {buf.enabled ? (
              <>
                <Seg<ShelfSize> value={buf.shelf} onChange={(v) => setBuf({ shelf: v })}
                  options={(Object.keys(RULES.racks) as ShelfSize[]).map((k) => ({ v: k, l: <span title={RULES.racks[k].name}>{k} <span className="text-bay-500">{RULES.racks[k].cap}</span></span> }))} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label><span className="label">Peak window (min)</span>
                    <input type="number" min={0} step={1} value={buf.windowMin} onChange={(e) => setBuf({ windowMin: Math.max(0, Number(e.target.value) || 0) })} className="w-full border border-bay-700 bg-bay-950 px-2 py-1.5 outline-none focus:border-hazard" />
                  </label>
                  <label><span className="label">Truck load (parcels)</span>
                    <input type="number" min={0} step={5} value={buf.truckLoad} onChange={(e) => setBuf({ truckLoad: Math.max(0, Number(e.target.value) || 0) })} className="w-full border border-bay-700 bg-bay-950 px-2 py-1.5 outline-none focus:border-hazard" />
                  </label>
                </div>
                <div className="mt-2 space-y-0.5 text-[11px]">
                  {p.buffers.map((b) => (
                    <div key={b.line} className="flex justify-between">
                      <span className="text-hazard">{b.line}</span>
                      <span>{b.parcels} parcels → <b className="text-bay-100">{b.shelves}× {buf.shelf}</b>{b.overflow > 0 && <span className="text-reject"> · +{b.overflow.toFixed(1)}/min</span>}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-bay-500">Door → LDR → shelves → UNL → line. Sized for overflow × window + one truck per door. Rack capacity & price: <span className="text-hazard">est.</span> (XL ≥16 seen in your save)</p>
              </>
            ) : <p className="text-[10px] text-bay-500">Shelves soak up truck dumps and backlog in front of each line.</p>}
          </Field>

          <Field label="Hardware catalog" right={`${s.unlocked.filter((n) => catalog.includes(n)).length}/${catalog.length}`}>
            <div className="space-y-1">
              {catalog.map((n) => {
                const on = s.unlocked.includes(n);
                const lv = LEVELED.includes(n);
                return (
                  <div key={n} className={`flex items-center gap-2 border px-2 py-1 ${on ? "border-bay-500 bg-bay-850" : "border-bay-800 opacity-60"}`}>
                    <button onClick={() => toggle(n)} className={`h-4 w-4 border ${on ? "border-hazard bg-hazard" : "border-bay-500"}`} aria-label={`toggle ${n}`}>
                      {on && <Check size={12} className="text-black" />}
                    </button>
                    <span className={`w-9 text-center text-[11px] font-bold ${tileClass(n)}`}>{n}</span>
                    <span className="flex-1 truncate text-[11px] text-bay-300" title={RULES.nodes[n].name}>{RULES.nodes[n].name}</span>
                    {lv && on ? (
                      <select value={s.levelOverrides[n] ?? 0} onChange={(e) => override(n, Number(e.target.value) as Level | 0)}
                        className="border border-bay-700 bg-bay-950 px-1 text-[11px] outline-none">
                        <option value={0}>={MK[s.scannerLevel]}</option>
                        {([1, 2, 3] as Level[]).map((v) => <option key={v} value={v}>{MK[v]}</option>)}
                      </select>
                    ) : (
                      <span className="text-[10px] text-bay-500" title={isEstimate(n) ? "Price not published yet" : undefined}>{isEstimate(n) ? "$?" : `$${RULES.nodes[n].cost}`}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Field>
          <p className="text-[10px] text-bay-500">Always available: CNV · JNR · BRG · SPL · PSR. LDR unlocks UNL.</p>
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="panel flex flex-wrap items-start gap-3 px-4 py-3">
            <div className="flex-1">
              <div className="text-[11px] tracking-widest text-hazard">TOPOLOGY ENGINE</div>
              <div className="mt-0.5">{p.reason}</div>
            </div>
            {p.flags.length > 0 && (
              <ul className="space-y-0.5 text-[11px]">
                {p.flags.map((f) => <li key={f} className="flex items-center gap-1.5 text-hazard"><AlertTriangle size={12} />{f}</li>)}
              </ul>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="panel p-3 sm:col-span-2">
              <div className="mb-1.5 flex justify-between text-[11px]">
                <span className="text-hazard">OUTPUT SPLIT</span>
                <span>{split.processed.toFixed(1)} / {split.input.toFixed(1)} box/min processed</span>
              </div>
              <div className="flex h-2 border border-bay-700 bg-bay-950">
                {([["bg-valid", split.standard], ["bg-amber-400", split.rail], ["bg-air", split.air], ["bg-sea", split.sea], ["bg-reject", split.reject], ["bg-bay-700", split.backlog]] as const).map(([c, n]) =>
                  n > 0 && <div key={c} className={`h-full ${c}`} style={{ width: `${(n / Math.max(split.input, 1e-9)) * 100}%` }} />)}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-bay-500">
                <span className="text-valid">STD {rate(split.standard)}</span>
                {s.outputs.rail && <span className="text-amber-300">RAIL {rate(split.rail)}</span>}
                {s.outputs.air && <span className="text-air">AIR {rate(split.air)}</span>}
                {s.outputs.sea && <span className="text-sea">SEA {rate(split.sea)}</span>}
                <span className="text-reject">REJECT {rate(split.reject)}</span>
                {split.backlog > 0 && <span>BACKLOG {rate(split.backlog)}</span>}
              </div>
            </div>
            {p.throughput.map((t) => (
              <div key={t.line} className="panel p-3">
                <div className="mb-1.5 flex justify-between text-[11px]"><span className="text-hazard">{t.line}</span><span>{t.input.toFixed(1)} / {Number.isFinite(t.capacity) ? t.capacity.toFixed(1) : "∞"} box/min</span></div>
                <div className="h-2 border border-bay-700 bg-bay-950">
                  <div className={`h-full ${t.utilization > 1 ? "bg-reject" : t.utilization > 0.85 ? "bg-hazard" : "bg-valid"}`} style={{ width: `${Math.min(100, t.utilization * 100)}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-bay-500">{t.bottleneck === "NONE" ? `${Math.round(t.utilization * 100)}% utilization` : `BOTTLENECK · ${t.bottleneck}`}</div>
                {buf.enabled && (() => { const b = p.buffers.find((x) => x.line === t.line); return b ? <div className="text-[10px] text-cyan-200"><Archive size={10} className="mr-1 inline" />{b.shelves}× {buf.shelf} shelf · {b.parcels} parcels</div> : null; })()}
              </div>
            ))}
          </div>

          <section className="panel">
            <header className="flex items-center justify-between border-b border-bay-700 px-3 py-2">
              <span className="tracking-widest text-hazard">[TOPOLOGY]</span>
              <CopyBtn text={topo} label="Copy ASCII" />
            </header>
            <div className="grid gap-3 p-3 2xl:grid-cols-2">
              {p.lines.map((l) => <LineStages key={l.id} line={l} s={s} />)}
            </div>
            <pre className="scroll-thin overflow-auto border-t border-bay-700 p-3 text-[12px] text-bay-300">{topo}</pre>
          </section>

          <Blueprint fp={p.footprint} site={site} onToggleSlot={toggleSlot} floors={levels > 1 ? { count: levels, active: Math.min(floor, levels - 1), onChange: setFloor } : undefined} grid={grid} setGrid={setGrid} template={p.grid} unlocked={effectiveUnlocked(s)} flow={<FlowDiagram plan={p} state={s} />} />

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="panel">
              <header className="border-b border-bay-700 px-3 py-2 tracking-widest text-hazard">[BOM] <span className="text-bay-500">recommended template{s.owned ? " · owned hardware credited" : ""}</span></header>
              <table className="w-full">
                <thead><tr className="text-left text-[10px] uppercase tracking-widest text-bay-500"><th className="px-3 py-1.5">ID</th><th>Node</th><th className="text-right">Qty</th><th className="text-right" title="Already placed in your imported save">Owned</th><th className="text-right">Unit</th><th className="px-3 text-right">Total</th></tr></thead>
                <tbody>
                  {p.bom.map((b) => (
                    <tr key={b.id} className="border-t border-bay-800">
                      <td className="px-3 py-1"><span className={`px-1 text-[11px] font-bold ${tileClass(b.id)}`}>{b.id}</span></td>
                      <td className="text-bay-300">{b.name}</td><td className="text-right">{b.qty}</td><td className="text-right text-valid">{b.owned ? b.owned : ""}</td><td className="text-right text-bay-500">{isEstimate(b.id) ? "$?" : money(b.unit)}</td><td className="px-3 text-right">{money(b.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-bay-700 font-bold"><td className="px-3 py-1.5" colSpan={5}>TO BUY</td><td className="px-3 text-right">{money(p.cost)}</td></tr>
                  <tr className="text-bay-500"><td className="px-3 py-1" colSpan={5}>BUDGET</td><td className="px-3 text-right">{money(s.budget)}</td></tr>
                  <tr className="font-bold"><td className="px-3 py-1" colSpan={5}>{remaining < 0 ? "SHORT" : "REMAINING"}</td><td className={`px-3 text-right ${remaining < 0 ? "text-reject" : "text-valid"}`}>{money(Math.abs(remaining))}</td></tr>
                </tfoot>
              </table>
            </section>
            <section className="panel">
              <header className="flex items-center justify-between border-b border-bay-700 px-3 py-2">
                <span className="tracking-widest text-hazard">[STATE] <span className="text-bay-500">{minified.length} chars</span></span>
                <CopyBtn text={minified} label="Copy minified" />
              </header>
              <pre className="scroll-thin max-h-80 overflow-auto p-3 text-[12px] text-bay-300">{JSON.stringify(ws, null, 2)}</pre>
            </section>
          </div>
        </section>
      </main>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onApply={applyPatch} />
    </div>
  );
}
