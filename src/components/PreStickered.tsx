import { useState } from "react";
import { Calculator, X } from "lucide-react";

interface Props { value: number; onChange: (v: number) => void }

/** Pre-stickered share slider + in-game measurement helper. */
export default function PreStickered({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(40);
  const [stickered, setStickered] = useState(14);
  const share = total > 0 ? Math.min(1, Math.max(0, stickered / total)) : 0;
  // 95% margin of error for a sample proportion: ±1.96·√(p(1−p)/n)
  const moe = total > 0 ? 1.96 * Math.sqrt((share * (1 - share)) / total) : 0;
  const num = "w-full border border-bay-700 bg-bay-950 px-2 py-1 outline-none focus:border-hazard";

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between">
        <span className="label">Pre-stickered share</span>
        <button className={`flex items-center gap-1 text-[10px] ${open ? "text-hazard" : "text-bay-500 hover:text-bay-100"}`} onClick={() => setOpen((o) => !o)}>
          {open ? <X size={11} /> : <Calculator size={11} />} {open ? "close" : "measure"}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input type="range" min={0.1} max={0.75} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-hazard" />
        <b className="w-10 text-right">{Math.round(value * 100)}%</b>
      </div>
      {open && (
        <div className="mt-2 space-y-2 border border-dashed border-bay-700 bg-bay-950 p-2 text-[11px]">
          <p className="text-bay-500">
            Watch one input door and count every box that comes through. Tally the ones that already carry an Approve or Deny sticker.
            Once a TAG is placed, count its Valid + Invalid exits against everything it scanned instead.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label><span className="label">Boxes counted</span>
              <input type="number" min={1} value={total} onChange={(e) => setTotal(Math.max(1, Number(e.target.value) || 1))} className={num} />
            </label>
            <label><span className="label">Already stickered</span>
              <input type="number" min={0} value={stickered} onChange={(e) => setStickered(Math.max(0, Number(e.target.value) || 0))} className={num} />
            </label>
          </div>
          <div className="flex items-center justify-between">
            <span>
              {stickered} ÷ {total} = <b className="text-hazard">{Math.round(share * 100)}%</b>
              <span className="text-bay-500"> ±{Math.round(moe * 100)}%</span>
            </span>
            <button className="btn btn-primary py-1" disabled={stickered > total} onClick={() => { onChange(Math.min(0.75, Math.max(0.1, share))); setOpen(false); }}>Apply</button>
          </div>
          {stickered > total && <p className="text-reject">Stickered can't exceed boxes counted.</p>}
          {moe > 0.1 && stickered <= total && <p className="text-bay-500">Count more boxes to tighten the estimate (≈100 gets you to ±10%).</p>}
        </div>
      )}
    </div>
  );
}
