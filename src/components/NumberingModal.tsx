import { useState } from "react";
import { store } from "../store";
import { ComicFile } from "../types";

interface Props {
  files: ComicFile[];   // already-filtered selected files, in current table order
  onClose: () => void;
}

export function NumberingModal({ files, onClose }: Props) {
  const [order, setOrder]       = useState<ComicFile[]>(files);
  const [start, setStart]       = useState("1");
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function handleDrop(toIdx: number) {
    if (dragging === null || dragging === toIdx) { setDragging(null); setDragOver(null); return; }
    const next = [...order];
    const [moved] = next.splice(dragging, 1);
    next.splice(toIdx, 0, moved);
    setOrder(next);
    setDragging(null);
    setDragOver(null);
  }

  function apply() {
    if (isNaN(startNum)) return;
    store.applyNumbering(order.map((f) => f.id), startNum);
    onClose();
  }

  const startNum = parseInt(start, 10);
  const preview  = order.map((_, i) => isNaN(startNum) ? "?" : String(startNum + i));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Fortlaufende Nummerierung</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="start-row">
            <label>Startzahl</label>
            <input
              type="number"
              value={start}
              min={0}
              style={{ width: 80 }}
              onChange={(e) => setStart(e.target.value)}
            />
            <span className="hint">Reihenfolge per Drag & Drop anpassen</span>
          </div>

          <div className="num-list">
            <div className="num-list-header">
              <span className="nl-num">#</span>
              <span className="nl-name">Dateiname</span>
              <span className="nl-series">Serie</span>
              <span className="nl-drag" />
            </div>
            {order.map((file, i) => (
              <div
                key={file.id}
                className={[
                  "num-row",
                  dragging === i   ? "dragging"  : "",
                  dragOver  === i  ? "drag-over" : "",
                ].filter(Boolean).join(" ")}
                draggable
                onDragStart={() => setDragging(i)}
                onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => { setDragging(null); setDragOver(null); }}
              >
                <span className="nl-num">{preview[i]}</span>
                <span className="nl-name" title={file.filename}>{file.filename}</span>
                <span className="nl-series">{file.meta.series ?? ""}</span>
                <span className="nl-drag">⠿</span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose}>Abbrechen</button>
          <button className="primary" onClick={apply}>Anwenden</button>
        </div>
      </div>

      <style>{`
        .modal-backdrop {
          position: fixed; inset: 0; z-index: 500;
          background: rgba(0,0,0,0.6);
          display: flex; align-items: center; justify-content: center;
        }
        .modal {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 8px; box-shadow: 0 16px 48px rgba(0,0,0,0.7);
          width: 560px; max-width: 90vw; max-height: 80vh;
          display: flex; flex-direction: column;
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px; border-bottom: 1px solid var(--border);
          font-weight: 600; font-size: 13px; flex-shrink: 0;
        }
        .modal-close {
          background: transparent; color: var(--text-muted); font-size: 14px;
          padding: 2px 6px;
        }
        .modal-close:hover { background: var(--row-hover); color: var(--text); }
        .modal-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; padding: 12px 16px; gap: 10px; }
        .modal-footer {
          display: flex; justify-content: flex-end; gap: 8px;
          padding: 10px 16px; border-top: 1px solid var(--border); flex-shrink: 0;
        }
        .start-row {
          display: flex; align-items: center; gap: 10px; flex-shrink: 0;
        }
        .start-row label { font-size: 12px; color: var(--text-muted); }
        .start-row .hint { font-size: 11px; color: var(--text-muted); margin-left: auto; font-style: italic; }
        .num-list { flex: 1; overflow-y: auto; border: 1px solid var(--border); border-radius: 4px; }
        .num-list-header {
          display: flex; align-items: center; padding: 3px 8px; gap: 6px;
          background: var(--surface2); border-bottom: 1px solid var(--border);
          font-size: 10px; font-weight: 700; color: var(--text-muted);
          text-transform: uppercase; user-select: none; flex-shrink: 0;
        }
        .num-row {
          display: flex; align-items: center; padding: 4px 8px; gap: 6px;
          border-bottom: 1px solid var(--border); font-size: 12px;
          cursor: grab; user-select: none;
        }
        .num-row:last-child { border-bottom: none; }
        .num-row:hover { background: var(--row-hover); }
        .num-row.dragging { opacity: 0.35; }
        .num-row.drag-over { border-top: 2px solid var(--accent); }
        .nl-num    { width: 36px; flex-shrink: 0; font-weight: 600; color: var(--accent); text-align: right; }
        .nl-name   { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nl-series { width: 140px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); }
        .nl-drag   { width: 18px; flex-shrink: 0; color: var(--text-muted); font-size: 14px; text-align: center; }
      `}</style>
    </div>
  );
}
