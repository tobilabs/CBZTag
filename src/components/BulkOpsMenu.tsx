import { useEffect, useRef, useState } from "react";
import { store } from "../store";
import { ComicFile, ComicMeta } from "../types";
import { parentFolderName, fileBaseName } from "../pathUtils";

interface Operation {
  label: string;
  group: string;
  apply: (file: ComicFile) => Partial<ComicMeta>;
}

const OPERATIONS: Operation[] = [
  // ── Aus Ordnername ────────────────────────────────────────────────────────
  { group: "Aus Ordnername", label: "Ordnername → Serie",  apply: (f) => ({ series: parentFolderName(f.path) }) },
  { group: "Aus Ordnername", label: "Ordnername → Titel",  apply: (f) => ({ title:  parentFolderName(f.path) }) },
  { group: "Aus Ordnername", label: "Ordnername → Autor",  apply: (f) => ({ writer: parentFolderName(f.path) }) },

  // ── Aus Dateiname ─────────────────────────────────────────────────────────
  { group: "Aus Dateiname",  label: "Dateiname → Serie",   apply: (f) => ({ series: fileBaseName(f.path) }) },
  { group: "Aus Dateiname",  label: "Dateiname → Titel",   apply: (f) => ({ title:  fileBaseName(f.path) }) },
  { group: "Aus Dateiname",  label: "Dateiname → Autor",   apply: (f) => ({ writer: fileBaseName(f.path) }) },

  // ── Feld → Feld ───────────────────────────────────────────────────────────
  { group: "Feld kopieren",  label: "Titel → Serie",       apply: (f) => ({ series: f.meta.title }) },
  { group: "Feld kopieren",  label: "Serie → Titel",       apply: (f) => ({ title:  f.meta.series }) },
  { group: "Feld kopieren",  label: "Titel → Autor",       apply: (f) => ({ writer: f.meta.title }) },
  { group: "Feld kopieren",  label: "Serie → Autor",       apply: (f) => ({ writer: f.meta.series }) },
];

interface Props {
  selectedIds: string[];
  onOpenNumbering: () => void;
}

export function BulkOpsMenu({ selectedIds, onOpenNumbering }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function run(op: Operation) {
    store.applyTransform(selectedIds, op.apply);
    setOpen(false);
  }

  // Group operations
  const groups: Record<string, Operation[]> = {};
  for (const op of OPERATIONS) {
    (groups[op.group] ??= []).push(op);
  }

  return (
    <div className="bulk-menu-wrap" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="bulk-menu-btn">
        Bulk-Operationen ▾
      </button>
      {open && (
        <div className="bulk-menu-dropdown">
          {Object.entries(groups).map(([group, ops]) => (
            <div key={group}>
              <div className="bulk-menu-group">{group}</div>
              {ops.map((op) => (
                <button
                  key={op.label}
                  className="bulk-menu-item"
                  onClick={() => run(op)}
                >
                  {op.label}
                </button>
              ))}
            </div>
          ))}
          <div className="bulk-menu-divider" />
          <button
            className="bulk-menu-item bulk-menu-item--accent"
            onClick={() => { setOpen(false); onOpenNumbering(); }}
          >
            Fortlaufende Nummerierung…
          </button>
        </div>
      )}
      <style>{`
        .bulk-menu-wrap { position: relative; }
        .bulk-menu-btn { background: var(--surface2); }
        .bulk-menu-dropdown {
          position: absolute; left: 0; top: calc(100% + 4px); z-index: 300;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          min-width: 220px; padding: 4px 0; white-space: nowrap;
        }
        .bulk-menu-group {
          padding: 6px 12px 3px; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);
        }
        .bulk-menu-item {
          display: block; width: 100%; text-align: left;
          padding: 5px 12px; font-size: 12px; border-radius: 0;
          background: transparent; color: var(--text);
        }
        .bulk-menu-item:hover { background: var(--row-hover); }
        .bulk-menu-item--accent { color: #6ab0f5; }
        .bulk-menu-divider { height: 1px; background: var(--border); margin: 4px 0; }
      `}</style>
    </div>
  );
}
