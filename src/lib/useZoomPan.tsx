import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

export const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
export const stepZoom = (z: number, dir: 1 | -1) =>
  dir > 0 ? ZOOMS.find((x) => x > z + 1e-3) ?? ZOOMS[ZOOMS.length - 1] : [...ZOOMS].reverse().find((x) => x < z - 1e-3) ?? ZOOMS[0];

/** Zoom level persisted to localStorage. `null` = fit-to-width (caller decides what that means). */
export function useStoredZoom(key: string, initial: number | null) {
  const [z, setZ] = useState<number | null>(() => {
    try { const v = localStorage.getItem(key); return v === null ? initial : (JSON.parse(v) as number | null); } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(z)); } catch { /* storage unavailable */ } }, [key, z]);
  return [z, setZ] as const;
}

/**
 * Ctrl/⌘ + wheel zooms around the cursor, middle-mouse drag pans.
 * `scale()` returns the currently rendered scale (lets fit-mode report its effective zoom).
 */
export function useZoomPan(ref: RefObject<HTMLElement>, scale: () => number, setZoom: (z: number) => void, dep: unknown) {
  const anchor = useRef<{ px: number; py: number; cx: number; cy: number; ratio: number } | null>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const cur = scaleRef.current();
      const next = stepZoom(cur, e.deltaY < 0 ? 1 : -1);
      if (Math.abs(next - cur) < 1e-3) return;
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      anchor.current = { px, py, cx: el.scrollLeft + px, cy: el.scrollTop + py, ratio: next / cur };
      setZoom(next);
    };
    let pan: { x: number; y: number; sl: number; st: number } | null = null;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      pan = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
      el.style.cursor = "grabbing";
    };
    const onMove = (e: MouseEvent) => {
      if (!pan) return;
      el.scrollLeft = pan.sl - (e.clientX - pan.x);
      el.scrollTop = pan.st - (e.clientY - pan.y);
    };
    const onUp = () => { if (pan) { pan = null; el.style.cursor = ""; } };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [ref, setZoom]);

  // keep the point under the cursor fixed after a wheel zoom
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = ref.current;
    if (!a || !el) return;
    el.scrollLeft = a.cx * a.ratio - a.px;
    el.scrollTop = a.cy * a.ratio - a.py;
    anchor.current = null;
  }, [dep, ref]);
}

interface ControlsProps { scale: number; fit?: boolean; onZoom: (z: number) => void; onReset: () => void; onFit?: () => void }

export function ZoomControls({ scale, fit, onZoom, onReset, onFit }: ControlsProps) {
  const b = "flex h-6 w-6 items-center justify-center border border-bay-700 bg-bay-950/90 text-bay-300 hover:border-hazard hover:text-hazard disabled:opacity-30";
  return (
    <div className="pointer-events-auto flex items-center gap-px shadow-lg shadow-black/50" onMouseDown={(e) => e.stopPropagation()}>
      <button className={b} onClick={() => onZoom(stepZoom(scale, -1))} disabled={scale <= ZOOMS[0] + 1e-3} title="Zoom out (Ctrl+wheel)"><Minus size={12} /></button>
      <button className="h-6 min-w-12 border border-bay-700 bg-bay-950/90 px-1 text-[10px] text-bay-100 hover:border-hazard" onClick={onReset} title="Reset to 100%">
        {fit ? "FIT" : `${Math.round(scale * 100)}%`}
      </button>
      <button className={b} onClick={() => onZoom(stepZoom(scale, 1))} disabled={scale >= ZOOMS[ZOOMS.length - 1] - 1e-3} title="Zoom in (Ctrl+wheel)"><Plus size={12} /></button>
      {onFit && <button className={`${b} ${fit ? "border-hazard text-hazard" : ""}`} onClick={onFit} title="Fit to pane"><Maximize2 size={11} /></button>}
    </div>
  );
}
