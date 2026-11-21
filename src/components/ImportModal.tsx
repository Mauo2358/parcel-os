import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { FileUp, X } from "lucide-react";
import { parseStatePatch, type WarehouseState } from "../lib/engine";
import { saveToWarehouseState } from "../lib/savParser";

interface Props { open: boolean; onClose: () => void; onApply: (w: WarehouseState) => void }

export default function ImportModal({ open, onClose, onApply }: Props) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<WarehouseState | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (open) { setErr(""); setTimeout(() => ref.current?.focus(), 0); } }, [open]);
  useEffect(() => {
    if (!text.trim()) { setPreview(null); setErr(""); return; }
    try { setPreview(parseStatePatch(text)); setErr(""); } catch (e) { setPreview(null); setErr((e as Error).message); }
  }, [text]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  const apply = () => { if (preview) { onApply(preview); setText(""); onClose(); } };
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.name.toLowerCase().endsWith(".sav")) {
      try {
        const { state } = saveToWarehouseState(await f.arrayBuffer());
        setText(JSON.stringify({ ...state, source: f.name }, null, 2));
      } catch (err) { setErr(`Save import failed: ${(err as Error).message}`); }
      return;
    }
    setText(await f.text());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div className="panel w-full max-w-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-bay-700 px-4 py-2">
          <span className="tracking-widest text-hazard">IMPORT STATE</span>
          <button className="text-bay-500 hover:text-bay-100" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="space-y-3 p-4">
          <p className="text-[11px] text-bay-500">Paste a warehouse_state.json object (raw or inside a ```json fence), or load the file. A Parcel Simulator <code>SaveN.sav</code> (%LOCALAPPDATA%\parcel\Saved\SaveGames) is decoded in-browser.</p>
          <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
            className="scroll-thin h-64 w-full resize-y border border-bay-700 bg-bay-950 p-2 outline-none focus:border-hazard"
            placeholder={'{"tier":3,"input_doors":2,...}'} />
          {err && <p className="text-[11px] text-reject">✗ {err}</p>}
          {preview && (
            <p className="text-[11px] text-valid">
              ✓ tier {preview.tier} · {preview.input_doors ?? "?"} doors · {(preview.unlocked_nodes ?? []).length} nodes
              {typeof preview.budget === "number" ? ` · $${preview.budget.toLocaleString()}` : " · budget unchanged"}
            </p>
          )}
          <div className="flex justify-between gap-2">
            <label className="btn cursor-pointer"><FileUp size={14} /> Load file
              <input type="file" accept=".json,.txt,.md,.sav,application/json" hidden onChange={onFile} />
            </label>
            <div className="flex gap-2">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={!preview} onClick={apply}>Apply patch</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
