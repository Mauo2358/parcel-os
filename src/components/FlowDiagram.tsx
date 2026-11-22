import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { ZoomControls, useStoredZoom, useZoomPan } from "../lib/useZoomPan";
import { DOCKS, LEVELED, MK, SCANNERS, effectiveUnlocked, levelOf, type Dock, type Line, type NodeId, type Plan, type PlannerState } from "../lib/engine";

/* SVG needs raw hex; keep in sync with tailwind.config.js */
const C = { white: "#dcdad4", green: "#5fd38d", red: "#ff5d5d", air: "#6cb6ff", sea: "#2dd4bf", rail: "#fbbf24", hazard: "#f5a524" };
const DOCK_C: Record<Dock, string> = { air: C.air, sea: C.sea, rail: C.rail };
const FILL: Record<string, { bg: string; fg: string }> = {
  TAG: { bg: "#f5a524", fg: "#000" }, CID: { bg: "#7a3a12", fg: "#ffd6b8" }, APV: { bg: "#4fb77a", fg: "#000" }, DNY: { bg: "#d94b4b", fg: "#000" },
  JNR: { bg: "#6d4fb3", fg: "#eae2ff" }, SPL: { bg: "#6d4fb3", fg: "#eae2ff" }, CTD: { bg: "#4a3a8a", fg: "#eae2ff" }, LDR: { bg: "#1f6f7a", fg: "#d9f6ff" },
  DOOR: { bg: "#dcdad4", fg: "#000" }, OUT: { bg: "#0f2a1c", fg: C.green }, MANUAL: { bg: "#2a1414", fg: C.red },
  AIR: { bg: "#0f2236", fg: C.air }, SEA: { bg: "#0c2a27", fg: C.sea }, RAIL: { bg: "#2a2210", fg: C.rail },
};
const fill = (t: string) => FILL[t] ?? { bg: "#1e3a52", fg: "#6cb6ff" };
const OUTLINE: Record<string, string> = { OUT: C.green, MANUAL: C.red, AIR: C.air, SEA: C.sea, RAIL: C.rail };

const W = 46, H = 26, GAP = 24, STEP = W + GAP, ROW = 44;
const WALL = 12, LEFT = WALL + 30, TOP = WALL + 40, ZONE_GAP = 46;

type El = ReactElement;
interface Belt { d: string; color: string; arrow: boolean; dash?: string }
interface Props { plan: Plan; state: PlannerState }

export default function FlowDiagram({ plan, state }: Props) {
  const v = useMemo(() => {
    const u = effectiveUnlocked(state);
    const apv = u.includes("APV");
    const dny = u.includes("DNY");
    const belts: Belt[] = [];
    const nodes: El[] = [];
    const labels: El[] = [];
    const doors: number[] = [];
    const docks: { x: number; y: number }[] = [];
    const zones: { top: number; bottom: number; title: string }[] = [];
    const used = new Set<string>();
    let k = 0;
    let maxX = 0;
    const id = () => `e${k++}`;

    const node = (x: number, cy: number, t: string, sub?: string) => {
      const f = fill(t);
      const o = OUTLINE[t];
      nodes.push(
        <g key={id()}>
          <rect x={x + 2} y={cy - H / 2 + 3} width={W} height={H} fill="#000" opacity={0.45} />
          <rect x={x} y={cy - H / 2} width={W} height={H} fill={f.bg} stroke={o ?? "#00000055"} strokeWidth={1} />
          <rect x={x} y={cy - H / 2} width={W} height={2} fill="#ffffff" opacity={0.12} />
          <text x={x + W / 2} y={cy + (sub ? -1 : 4)} textAnchor="middle" fontSize={10} fontWeight={700} fill={f.fg}>{t}</text>
          {sub && <text x={x + W / 2} y={cy + 9} textAnchor="middle" fontSize={7} fill={f.fg} opacity={0.8}>{sub}</text>}
        </g>,
      );
      maxX = Math.max(maxX, x + W);
    };
    const belt = (d: string, color: string, arrow = true, dash?: string) => { belts.push({ d, color, arrow, dash }); used.add(color); };
    const link = (x: number, cy: number) => belt(`M${x - GAP} ${cy} H${x}`, C.white);
    const label = (x: number, cy: number, t: string, color: string, anchor: "start" | "middle" | "end" = "start") =>
      labels.push(<text key={id()} x={x} y={cy} fontSize={8} fill={color} textAnchor={anchor} letterSpacing={1}>{t}</text>);
    const sub = (n: NodeId) => (LEVELED.includes(n) ? MK[levelOf(state, n)] : undefined);
    const isEject = (n: NodeId) => n === "TAG" || n === "CID" || SCANNERS.includes(n);

    /** CTD stages (or one manual sort station) on row cy, docks one row up at dockY. Returns next x. */
    const sortStage = (l: Line, x: number, cy: number, dockY: number) => {
      if (l.manualSort) {
        const wanted = DOCKS.filter((d) => state.outputs[d]);
        link(x, cy);
        node(x, cy, "MANUAL", "SORT");
        wanted.forEach((d, i) => {
          const dx = x + i * STEP;
          const sx = x + W / 2 + (wanted.length > 1 ? (i ? 8 : -8) : 0);
          belt(`M${sx} ${cy - H / 2} V${dockY + H / 2 + 8} H${dx + W / 2} V${dockY + H / 2}`, DOCK_C[d], true, "4 3");
          node(dx, dockY, d.toUpperCase(), "BY HAND");
        });
        const next = x + STEP * Math.max(1, wanted.length);
        if (next - GAP > x + W) belt(`M${x + W} ${cy} H${next - GAP}`, C.white, false);
        return next;
      }
      for (const d of l.sorts) {
        link(x, cy);
        node(x, cy, "CTD", d.toUpperCase());
        belt(`M${x + W / 2} ${cy - H / 2} V${dockY + H / 2}`, DOCK_C[d]);
        node(x, dockY, d.toUpperCase(), "DOCK");
        x += STEP;
      }
      return x;
    };

    const drawSerial = (l: Line, y0: number) => {
      const merged = l.doors.length > 1;
      const bypass = l.mode === "tag_bypass";
      const hasSort = l.sorts.length > 0 || l.manualSort;
      const gY = y0;
      const mY = bypass || hasSort ? y0 + ROW : y0;
      const rY = mY + ROW;
      const chain = l.chain.filter((n) => n !== "JNR");
      let x = LEFT;
      node(x, mY, "DOOR", `D${l.doors[0]}`); doors.push(mY);
      x += STEP;
      if (merged) {
        const dY = rY + ROW;
        node(LEFT, dY, "DOOR", `D${l.doors[1]}`); doors.push(dY);
        belt(`M${LEFT + W} ${dY} H${x + W / 2} V${mY + H / 2}`, C.white);
        link(x, mY);
        node(x, mY, "JNR");
        label(x + W / 2 + 6, dY - 6, "MERGE", C.white);
        x += STEP;
      }
      const taps: number[] = [];
      let tagX = -1;
      for (const n of chain) {
        link(x, mY);
        node(x, mY, n, sub(n));
        if (n === "TAG") tagX = x;
        if (isEject(n)) taps.push(x + W / 2);
        x += STEP;
      }
      if (taps.length) {
        taps.forEach((tx) => belt(`M${tx} ${mY + H / 2} V${rY}`, C.red, false));
        belt(`M${taps[0]} ${rY} H${x}`, C.red);
        node(x, rY, dny ? "DNY" : "MANUAL", dny ? undefined : "DENY");
        label(taps[0] + 6, rY + 14, "INVALID · REJECT SPINE", C.red);
      }
      if (!apv) { link(x, mY); node(x, mY, "MANUAL", "APPROVE"); x += STEP; }
      const green = (to: number) => {
        belt(`M${tagX + W / 2} ${mY - H / 2} V${gY} H${to + W / 2} V${mY - H / 2}`, C.green);
        label(tagX + W / 2 + 6, gY - 5, "VALID · PRE-STICKERED BYPASS", C.green);
      };
      if (bypass && tagX >= 0 && hasSort) {
        link(x, mY); node(x, mY, "JNR"); green(x);
        x += STEP;
      }
      x = sortStage(l, x, mY, gY);
      link(x, mY);
      node(x, mY, "OUT", "STD");
      docks.push({ x: x + W, y: mY });
      if (bypass && tagX >= 0 && !hasSort) green(x);
      return (merged ? rY + ROW : rY) + H / 2;
    };

    const drawPivot = (l: Line, y0: number) => {
      const aY = y0, rY = y0 + ROW, bY = y0 + ROW * 2;
      const chain = l.chain.filter((n) => n !== "SPL");
      let x = LEFT;
      node(x, rY, "DOOR", `D${l.doors[0]}`); doors.push(rY);
      x += STEP;
      link(x, rY);
      node(x, rY, "SPL");
      label(x + W / 2, rY + H / 2 + 12, "SPLIT A/B", C.white, "middle");
      const sx = x + W;
      x += STEP;
      belt(`M${sx} ${rY - 6} H${sx + 10} V${aY} H${x}`, C.white);
      belt(`M${sx} ${rY + 6} H${sx + 10} V${bY} H${x}`, C.white);
      const taps: number[] = [];
      chain.forEach((n, i) => {
        if (i > 0) { link(x, aY); link(x, bY); }
        node(x, aY, n, sub(n)); node(x, bY, n, sub(n));
        if (isEject(n)) taps.push(x + W / 2);
        x += STEP;
      });
      // re-merge A + B
      belt(`M${x - GAP} ${aY} H${x + W / 2} V${rY - H / 2}`, C.white);
      belt(`M${x - GAP} ${bY} H${x + W / 2} V${rY + H / 2}`, C.white);
      node(x, rY, "JNR");
      label(x + W / 2, bY + H / 2 + 12, "REMERGE", C.white, "middle");
      const drop = x - GAP / 2;
      x += STEP;
      if (!apv) { link(x, rY); node(x, rY, "MANUAL", "APPROVE"); x += STEP; }
      x = sortStage(l, x, rY, aY);
      link(x, rY);
      node(x, rY, "OUT", "STD");
      docks.push({ x: x + W, y: rY });
      taps.forEach((tx) => { belt(`M${tx} ${aY + H / 2} V${rY}`, C.red, false); belt(`M${tx} ${bY - H / 2} V${rY}`, C.red, false); });
      if (taps.length) {
        belt(`M${taps[0]} ${rY} H${drop} V${bY + ROW} H${x}`, C.red);
        node(x, bY + ROW, dny ? "DNY" : "MANUAL", dny ? undefined : "DENY");
        label(taps[0] + 6, rY - 6, "SHARED REJECT SPINE", C.red);
      }
      return bY + ROW + H / 2;
    };

    let y = TOP;
    for (const l of plan.lines) {
      const top = y;
      const bottom = l.mode === "parallel_array" ? drawPivot(l, y) : drawSerial(l, y);
      zones.push({ top: top - 34, bottom: bottom + 12, title: `${l.id} · ${l.mode.replace("_", " ").toUpperCase()}` });
      y = bottom + ZONE_GAP + 34;
    }
    const width = maxX + 40 + WALL;
    const height = (zones.length ? zones[zones.length - 1].bottom : TOP) + 20 + WALL;
    return { belts, nodes, labels, doors, docks, zones, width, height, used };
  }, [plan, state]);

  const { width, height } = v;
  const [fz, setFz] = useStoredZoom("parcelos.zoom.floor", null); // null = fit to pane width
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paneW, setPaneW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPaneW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fitScale = paneW > 0 ? Math.min(1, (paneW - 24) / width) : 1;
  const scale = fz ?? fitScale;
  useZoomPan(scrollRef, () => scale, setFz, scale);
  const arrow = (c: string) => (
    <marker key={c} id={`arr-${c.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill={c} />
    </marker>
  );
  const legend: [string, string][] = [["MAIN BELT", C.white], ["VALID BYPASS", C.green], ["REJECT SPINE", C.red]];
  if (v.used.has(C.rail)) legend.push(["RAIL SORT", C.rail]);
  if (v.used.has(C.air)) legend.push(["AIR SORT", C.air]);
  if (v.used.has(C.sea)) legend.push(["SEA SORT", C.sea]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bay-950">
      <div className="flex flex-wrap items-center gap-4 px-3 pt-2 text-[10px] tracking-widest">
        {legend.map(([t, c]) => (
          <span key={t} className="flex items-center gap-1.5" style={{ color: c === C.white ? undefined : c }}>
            <i className="inline-block h-0.5 w-5" style={{ background: c }} />{t}
          </span>
        ))}
        <span className="ml-auto">
          <ZoomControls scale={scale} fit={fz === null} onZoom={setFz} onReset={() => setFz(1)} onFit={() => setFz(null)} />
        </span>
      </div>
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-auto p-3">
      <svg viewBox={`0 0 ${width} ${height}`} width={width * scale} height={height * scale} className="block font-mono">
        <defs>
          {[C.white, C.green, C.red, C.rail, C.air, C.sea].map(arrow)}
          <pattern id="po-floor" width="32" height="32" patternUnits="userSpaceOnUse">
            <rect width="32" height="32" fill="#13171a" />
            <path d="M32 0V32H0" fill="none" stroke="#1b2124" strokeWidth="1" />
            <circle cx="7" cy="11" r="0.7" fill="#1e2427" /><circle cx="22" cy="5" r="0.5" fill="#1a1f22" /><circle cx="18" cy="24" r="0.8" fill="#1d2326" />
          </pattern>
          <pattern id="po-hazard" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="12" height="12" fill="#17150d" />
            <rect width="6" height="12" fill={C.hazard} opacity="0.55" />
          </pattern>
        </defs>

        {/* floor */}
        <rect width={width} height={height} fill="url(#po-floor)" />

        {/* painted line zones */}
        {v.zones.map((z) => (
          <g key={z.title}>
            <rect x={LEFT - 16} y={z.top} width={width - WALL - LEFT - 10} height={z.bottom - z.top} fill="#f5a52405" stroke={C.hazard} strokeOpacity={0.3} strokeDasharray="8 5" />
            <text x={LEFT - 8} y={z.top + 13} fontSize={10} fontWeight={700} fill={C.hazard} opacity={0.75} letterSpacing={2}>{z.title}</text>
          </g>
        ))}

        {/* walls */}
        <rect x={0} y={0} width={width} height={WALL} fill="url(#po-hazard)" />
        <rect x={0} y={height - WALL} width={width} height={WALL} fill="url(#po-hazard)" />
        <rect x={0} y={0} width={WALL} height={height} fill="url(#po-hazard)" />
        <rect x={width - WALL} y={0} width={WALL} height={height} fill="url(#po-hazard)" />

        {/* inbound bays (left wall) + outbound docks (right wall) */}
        {v.doors.map((y) => (
          <g key={`in${y}`}>
            <rect x={0} y={y - H / 2 - 5} width={WALL} height={H + 10} fill="#13171a" />
            <rect x={1} y={y - H / 2 - 5} width={4} height={H + 10} fill={C.white} opacity={0.55} />
            <path d={`M${WALL} ${y} H${LEFT}`} stroke="#262c30" strokeWidth={12} />
            <path d={`M${WALL} ${y} H${LEFT}`} stroke="#353d42" strokeWidth={12} strokeDasharray="2 4" />
            <path d={`M${WALL} ${y} H${LEFT}`} stroke={C.white} strokeWidth={2} markerEnd="url(#arr-dcdad4)" />
          </g>
        ))}
        {v.docks.map((d) => (
          <g key={`out${d.y}`}>
            <path d={`M${d.x} ${d.y} H${width - WALL}`} stroke="#262c30" strokeWidth={12} />
            <path d={`M${d.x} ${d.y} H${width - WALL}`} stroke="#353d42" strokeWidth={12} strokeDasharray="2 4" />
            <path d={`M${d.x} ${d.y} H${width - WALL}`} stroke={C.green} strokeWidth={2} markerEnd="url(#arr-5fd38d)" />
            <rect x={width - WALL} y={d.y - H / 2 - 5} width={WALL} height={H + 10} fill="#0f2a1c" />
            <rect x={width - 5} y={d.y - H / 2 - 5} width={4} height={H + 10} fill={C.green} opacity={0.7} />
          </g>
        ))}

        {/* conveyor track (rubber + rollers), then flow line on top */}
        {v.belts.map((b, i) => <path key={`t${i}`} d={b.d} fill="none" stroke="#262c30" strokeWidth={12} strokeLinejoin="round" />)}
        {v.belts.map((b, i) => <path key={`r${i}`} d={b.d} fill="none" stroke="#353d42" strokeWidth={12} strokeDasharray="2 4" />)}
        {v.belts.map((b, i) => (
          <path key={`f${i}`} d={b.d} fill="none" stroke={b.color} strokeWidth={2} strokeDasharray={b.dash}
            markerEnd={b.arrow ? `url(#arr-${b.color.slice(1)})` : undefined} />
        ))}

        {v.nodes}
        {v.labels}
      </svg>
      </div>
    </div>
  );
}
