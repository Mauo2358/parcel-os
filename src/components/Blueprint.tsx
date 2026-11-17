import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Eraser, MousePointer2, RotateCw, Sparkles, Trash2, Wand2 } from "lucide-react";
import { ZoomControls, useStoredZoom, useZoomPan } from "../lib/useZoomPan";
import { bomFromGrid, key, tileCost, tileName, type Cell, type Dir, type Footprint, type Grid, type NodeId, type TileType } from "../lib/engine";

type Tool = { kind: "paint"; t: TileType } | { kind: "rotate" } | { kind: "erase" } | { kind: "inspect" };

const PALETTE: { group: string; items: TileType[] }[] = [
  { group: "Belts", items: ["CNV", "JNR", "BRG", "SPL", "PSR", "CTD"] },
  { group: "Scanners", items: ["TAG", "SER", "WGT", "CNT", "CRG", "STP", "PRH", "CID"] },
  { group: "Stickers", items: ["APV", "DNY"] },
  { group: "Transport", items: ["LDR", "RACK", "UNL"] },
  { group: "Markers", items: ["DOOR", "OUT", "AIR", "SEA"] },
];

export function tileClass(t: TileType): string {
  switch (t) {
    case "CNV": case "PSR": return "bg-bay-700 text-bay-300";
    case "JNR": case "BRG": case "SPL": case "CTD": return "bg-violet-900/70 text-violet-200";
    case "TAG": return "bg-hazard text-black";
    case "CID": return "bg-orange-900/80 text-orange-200";
    case "APV": return "bg-valid/80 text-black";
    case "DNY": return "bg-reject/80 text-black";
    case "LDR": case "UNL": case "RACK": return "bg-cyan-800/80 text-cyan-100";
    case "DOOR": return "bg-bay-100 text-black";
    case "OUT": return "bg-emerald-950 text-valid border border-valid/50";
    case "AIR": return "bg-[#0f2236] text-air border border-air/50";
    case "SEA": return "bg-[#0c2a27] text-sea border border-sea/50";
    default: return "bg-scan/25 text-scan";
  }
}

const rot = (d: Dir): Dir => (((d + 1) % 4) as Dir);

interface Props {
  fp: Footprint;
  grid: Grid;
  setGrid: (g: Grid | ((g: Grid) => Grid)) => void;
  template: Grid;
  unlocked: NodeId[];
  flow?: ReactNode;
}

export default function Blueprint({ fp, grid, setGrid, template, unlocked, flow }: Props) {
  const [tool, setTool] = useState<Tool>({ kind: "paint", t: "CNV" });
  const [dir, setDir] = useState<Dir>(0);
  const [hover, setHover] = useState<string | null>(null);
  const painting = useRef(false);
  const [gz, setGz] = useStoredZoom("parcelos.zoom.grid", 1);
  const zoom = gz ?? 1;
  const cell = Math.round(22 * zoom);
  const showText = cell >= 14;
  const scrollRef = useRef<HTMLDivElement>(null);
  useZoomPan(scrollRef, () => zoom, setGz, zoom);

  useEffect(() => {
    const up = () => (painting.current = false);
    const keyH = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") setDir((d) => rot(d));
      if (e.key === "e" || e.key === "E") setTool({ kind: "erase" });
    };
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", keyH);
    return () => { window.removeEventListener("mouseup", up); window.removeEventListener("keydown", keyH); };
  }, []);

  const apply = useCallback((r: number, c: number, alt = false) => {
    if (fp.blocked(r, c)) return;
    const k = key(r, c);
    setGrid((g) => {
      const n = { ...g };
      if (alt || tool.kind === "erase") delete n[k];
      else if (tool.kind === "rotate") { if (n[k]) n[k] = { ...n[k], d: rot(n[k].d) }; }
      else if (tool.kind === "paint") n[k] = { t: tool.t, d: dir };
      return n;
    });
  }, [fp, tool, dir, setGrid]);

  const inBounds = useMemo(() => {
    const out: Grid = {};
    for (const [k, v] of Object.entries(grid)) {
      const [r, c] = k.split(",").map(Number);
      if (r < fp.rows && c < fp.cols && !fp.blocked(r, c)) out[k] = v;
    }
    return out;
  }, [grid, fp]);
  const bom = useMemo(() => bomFromGrid(inBounds), [inBounds]);
  const cost = bom.reduce((a, b) => a + b.total, 0);
  const matches = useMemo(() => {
    const a = Object.entries(template);
    if (!a.length) return 0;
    return a.filter(([k, v]) => inBounds[k]?.t === v.t).length / a.length;
  }, [template, inBounds]);

  const hoverCell: Cell | undefined = hover ? inBounds[hover] : undefined;
  const isLocked = (t: TileType) => ["TAG", "SER", "WGT", "CNT", "CRG", "STP", "PRH", "CID", "APV", "DNY", "CTD", "LDR", "UNL"].includes(t) && !unlocked.includes(t as NodeId);

  return (
    <section className="panel">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-bay-700 px-3 py-2">
        <span className="tracking-widest text-hazard">[BLUEPRINT] <span className="text-bay-500">{fp.rows}×{fp.cols} · {fp.tiles} tiles</span></span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button className="btn btn-primary" onClick={() => setGrid({ ...template })} title="Replace grid with recommended baseline">
            <Wand2 size={14} /> Auto-populate
          </button>
          <button className="btn" onClick={() => setGrid((g) => ({ ...template, ...g }))} title="Fill empty tiles from template, keep your edits">
            <Sparkles size={14} /> Merge template
          </button>
          <button className="btn" onClick={() => setGrid({})}><Trash2 size={14} /> Clear</button>
        </div>
      </header>

      <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-bay-700 px-3 py-2">
        <div className="flex items-center gap-1">
          <button className={`btn ${tool.kind === "inspect" ? "btn-on" : ""}`} onClick={() => setTool({ kind: "inspect" })} title="Inspect"><MousePointer2 size={14} /></button>
          <button className={`btn ${tool.kind === "rotate" ? "btn-on" : ""}`} onClick={() => setTool({ kind: "rotate" })} title="Rotate placed tile"><RotateCw size={14} /></button>
          <button className={`btn ${tool.kind === "erase" ? "btn-on" : ""}`} onClick={() => setTool({ kind: "erase" })} title="Erase (E · right-click)"><Eraser size={14} /></button>
          <button className="btn" onClick={() => setDir((d) => rot(d))} title="Placement direction (R)">
            <ArrowRight size={14} style={{ transform: `rotate(${dir * 90}deg)` }} /> R
          </button>
        </div>
        {PALETTE.map((g) => (
          <div key={g.group} className="flex items-center gap-1">
            <span className="mr-1 text-[10px] uppercase tracking-widest text-bay-500">{g.group}</span>
            {g.items.map((t) => (
              <button key={t} title={`${tileName(t)} · $${tileCost(t)}${isLocked(t) ? " · LOCKED" : ""}`}
                className={`h-7 min-w-9 border px-1 text-[11px] ${tool.kind === "paint" && tool.t === t ? "border-hazard ring-1 ring-hazard" : "border-transparent"} ${tileClass(t)} ${isLocked(t) ? "opacity-40" : ""}`}
                onClick={() => setTool({ kind: "paint", t })}>{t}</button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex max-h-[640px] flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 shrink-0 flex-col lg:max-w-[60%]">
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <span className="text-[10px] tracking-widest text-bay-500">TILE GRID</span>
          <ZoomControls scale={zoom} onZoom={setGz} onReset={() => setGz(1)} />
        </div>
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-auto p-3">
        <div
          className="grid select-none gap-px bg-bay-800 p-px"
          style={{ gridTemplateColumns: `repeat(${fp.cols}, ${cell}px)`, width: fp.cols * (cell + 1) + 1 }}
          onContextMenu={(e) => e.preventDefault()}
          onMouseLeave={() => setHover(null)}
        >
          {Array.from({ length: fp.rows * fp.cols }, (_, i) => {
            const r = Math.floor(i / fp.cols);
            const c = i % fp.cols;
            const k = key(r, c);
            if (fp.blocked(r, c)) return <div key={k} className="hazard-stripe" style={{ height: cell }} />;
            const v = inBounds[k];
            const ghost = !v && template[k];
            const exp = r >= 10 ? (Math.floor((r - 10) / 10) % 2 === 0) !== (c >= 10) : false;
            return (
              <div
                key={k}
                className={`relative flex items-center justify-center leading-none ${v ? tileClass(v.t) : exp ? "bg-[#101315]" : "bg-bay-950"} ${tool.kind !== "inspect" ? "cursor-crosshair" : ""} hover:outline hover:outline-1 hover:outline-hazard`}
                style={{ height: cell, fontSize: Math.max(6, Math.round(8 * zoom)) }}
                onMouseDown={(e) => { if (tool.kind === "inspect" || e.button === 1) return; painting.current = true; apply(r, c, e.button === 2); }}
                onMouseEnter={(e) => { setHover(k); if (painting.current && tool.kind !== "rotate") apply(r, c, e.buttons === 2); }}
              >
                {v ? (
                  <>
                    {showText && <span className="font-bold">{v.t}</span>}
                    {!["DOOR", "OUT", "AIR", "SEA"].includes(v.t) && (
                      <ArrowRight size={Math.max(6, Math.round(7 * zoom))} className="absolute bottom-0 right-0 opacity-80" style={{ transform: `rotate(${v.d * 90}deg)` }} />
                    )}
                  </>
                ) : ghost && showText ? (
                  <span className="text-bay-700">{ghost.t}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      </div>
      {flow && <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-bay-700 lg:border-l lg:border-t-0">{flow}</div>}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-bay-700 px-3 py-2 text-[11px] text-bay-500">
        <span>
          {hover ? `(${hover}) ${hoverCell ? `${tileName(hoverCell.t)} · ${["E", "S", "W", "N"][hoverCell.d]}` : "empty"}` : "LMB paint · RMB erase · R rotate · E erase · Ctrl+wheel zoom · MMB drag pan"}
        </span>
        <span>
          Placed <b className="text-bay-100">${cost.toLocaleString()}</b> · template match{" "}
          <b className={matches > 0.95 ? "text-valid" : "text-hazard"}>{Math.round(matches * 100)}%</b>
        </span>
      </footer>
    </section>
  );
}
