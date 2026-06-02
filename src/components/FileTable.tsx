import { useState, useRef, useCallback, useEffect } from "react";
import { store, useStore } from "../store";
import { ComicMeta, SortField, SortDir } from "../types";

// All columns available for display
const ALL_COLUMNS: { key: keyof ComicMeta; label: string; defaultWidth: number }[] = [
  { key: "title",           label: "Titel",        defaultWidth: 200 },
  { key: "series",          label: "Serie",        defaultWidth: 160 },
  { key: "number",          label: "Nr.",          defaultWidth: 48  },
  { key: "count",           label: "Gesamt",       defaultWidth: 60  },
  { key: "volume",          label: "Band",         defaultWidth: 50  },
  { key: "year",            label: "Jahr",         defaultWidth: 58  },
  { key: "month",           label: "Monat",        defaultWidth: 56  },
  { key: "writer",          label: "Autor",        defaultWidth: 140 },
  { key: "penciller",       label: "Zeichner",     defaultWidth: 130 },
  { key: "publisher",       label: "Verlag",       defaultWidth: 120 },
  { key: "imprint",         label: "Imprint",      defaultWidth: 110 },
  { key: "genre",           label: "Genre",        defaultWidth: 120 },
  { key: "format",          label: "Format",       defaultWidth: 80  },
  { key: "languageISO",     label: "Sprache",      defaultWidth: 70  },
  { key: "ageRating",       label: "FSK",          defaultWidth: 100 },
  { key: "blackAndWhite",   label: "S/W",          defaultWidth: 50  },
  { key: "manga",           label: "Manga",        defaultWidth: 60  },
  { key: "storyArc",        label: "Story Arc",    defaultWidth: 130 },
  { key: "seriesGroup",     label: "Seriengruppe", defaultWidth: 120 },
  { key: "communityRating", label: "Bewertung",    defaultWidth: 80  },
];

const DEFAULT_VISIBLE = new Set<keyof ComicMeta>(["title", "series", "number", "year", "publisher"]);
const STORAGE_KEY = "cbztag_columns";

function loadVisibleKeys(): Set<keyof ComicMeta> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set(DEFAULT_VISIBLE);
}

function saveVisibleKeys(keys: Set<keyof ComicMeta>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
}

export function FileTable() {
  const { files, selected } = useStore();
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir,   setSortDir]   = useState<SortDir>("asc");
  const [visibleKeys, setVisibleKeys] = useState<Set<keyof ComicMeta>>(loadVisibleKeys);
  const [pickerOpen, setPickerOpen]   = useState(false);
  const anchorIdx  = useRef<number>(-1);
  const bodyRef    = useRef<HTMLDivElement>(null);
  const pickerRef  = useRef<HTMLDivElement>(null);

  const visibleCols = ALL_COLUMNS.filter((c) => visibleKeys.has(c.key));

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  function toggleColumn(key: keyof ComicMeta) {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      saveVisibleKeys(next);
      return next;
    });
  }

  // ── Sort ───────────────────────────────────────────────────────────────────
  const sorted = [...files].sort((a, b) => {
    const av = a.meta[sortField] ?? a.filename;
    const bv = b.meta[sortField] ?? b.filename;
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  function handleSort(key: SortField) {
    if (key === sortField) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(key); setSortDir("asc"); }
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  function selectSingle(idx: number) {
    anchorIdx.current = idx;
    store.setSelected(new Set([sorted[idx].id]));
  }
  function selectRange(from: number, to: number) {
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    store.setSelected(new Set(sorted.slice(lo, hi + 1).map((f) => f.id)));
  }
  function toggleOne(idx: number) {
    anchorIdx.current = idx;
    const next = new Set(selected);
    next.has(sorted[idx].id) ? next.delete(sorted[idx].id) : next.add(sorted[idx].id);
    store.setSelected(next);
  }
  function handleRowClick(idx: number, e: React.MouseEvent) {
    if (e.shiftKey && anchorIdx.current >= 0) selectRange(anchorIdx.current, idx);
    else if (e.metaKey || e.ctrlKey) toggleOne(idx);
    else selectSingle(idx);
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (sorted.length === 0) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === "a") {
      e.preventDefault();
      anchorIdx.current = 0;
      store.setSelected(new Set(sorted.map((f) => f.id)));
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selected.size > 0) { e.preventDefault(); store.removeFiles([...selected]); anchorIdx.current = -1; }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      let cursor = anchorIdx.current < 0
        ? (dir === 1 ? 0 : sorted.length - 1)
        : Math.max(0, Math.min(sorted.length - 1, anchorIdx.current + dir));
      if (e.shiftKey && anchorIdx.current >= 0) selectRange(anchorIdx.current, cursor);
      else selectSingle(cursor);
      const row = bodyRef.current?.children[cursor] as HTMLElement | undefined;
      row?.scrollIntoView({ block: "nearest" });
    }
  }, [sorted, selected]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="file-table-wrap"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); }}
    >
      {/* Header */}
      <div className="file-table-header">
        <div className="col col-status" />
        <div className="col col-filename">Dateiname</div>
        {visibleCols.map((c) => (
          <div
            key={c.key}
            className={`col sortable${sortField === c.key ? " sorted" : ""}`}
            style={{ width: c.defaultWidth, flexShrink: 0 }}
            onClick={() => handleSort(c.key)}
          >
            {c.label}
            {sortField === c.key && (
              <span className="sort-arrow">{sortDir === "asc" ? " ▲" : " ▼"}</span>
            )}
          </div>
        ))}

        {/* Column picker button */}
        <div className="col-picker-wrap" ref={pickerRef}>
          <button
            className="col-picker-btn"
            title="Spalten auswählen"
            onClick={() => setPickerOpen((v) => !v)}
          >
            ⊞
          </button>
          {pickerOpen && (
            <div className="col-picker-dropdown">
              <div className="col-picker-title">Spalten</div>
              {ALL_COLUMNS.map((c) => (
                <label key={c.key} className="col-picker-item">
                  <input
                    type="checkbox"
                    checked={visibleKeys.has(c.key)}
                    onChange={() => toggleColumn(c.key)}
                  />
                  {c.label}
                </label>
              ))}
              <div className="col-picker-actions">
                <button onClick={() => { setVisibleKeys(new Set(DEFAULT_VISIBLE)); saveVisibleKeys(new Set(DEFAULT_VISIBLE)); }}>
                  Zurücksetzen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="file-table-body" ref={bodyRef}>
        {sorted.length === 0 && (
          <div className="table-empty">Keine Dateien geladen</div>
        )}
        {sorted.map((file, idx) => (
          <div
            key={file.id}
            className={["file-row", selected.has(file.id) ? "selected" : "", file.dirty ? "dirty" : ""].filter(Boolean).join(" ")}
            onClick={(e) => handleRowClick(idx, e)}
          >
            <div className="col col-status">
              {file.loading && <span title="Lädt…">⏳</span>}
              {file.error   && <span title={file.error}>⚠</span>}
              {file.dirty && !file.loading && <span title="Ungespeichert">●</span>}
            </div>
            <div className="col col-filename" title={file.path}>{file.filename}</div>
            {visibleCols.map((c) => (
              <div key={c.key} className="col" style={{ width: c.defaultWidth, flexShrink: 0 }}>
                {file.meta[c.key] ?? ""}
              </div>
            ))}
            {/* spacer so the ⊞ button column stays aligned */}
            <div style={{ width: 28, flexShrink: 0 }} />
          </div>
        ))}
      </div>

      <style>{`
        .file-table-wrap {
          flex: 1; display: flex; flex-direction: column;
          overflow: hidden; background: var(--bg); outline: none;
        }
        .file-table-header {
          display: flex; align-items: center; padding: 0 8px; height: 28px;
          background: var(--surface); border-bottom: 1px solid var(--border);
          font-size: 11px; font-weight: 600; color: var(--text-muted);
          user-select: none; flex-shrink: 0; overflow: visible; position: relative; z-index: 10;
        }
        .file-table-body { flex: 1; overflow-y: auto; overflow-x: auto; }
        .col { padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .col-status   { width: 22px; flex-shrink: 0; font-size: 10px; }
        .col-filename { flex: 1; min-width: 120px; }
        .sortable { cursor: pointer; }
        .sortable:hover { color: var(--text); }
        .sort-arrow { color: var(--accent); }
        .file-row {
          display: flex; align-items: center; padding: 0 8px; height: 26px;
          cursor: pointer; border-bottom: 1px solid var(--border);
          font-size: 12px; user-select: none;
        }
        .file-row:hover    { background: var(--row-hover); }
        .file-row.selected { background: var(--row-selected); }
        .file-row.dirty .col-status { color: var(--accent); }
        .table-empty { padding: 32px; text-align: center; color: var(--text-muted); font-size: 12px; }

        /* Column picker */
        .col-picker-wrap { position: relative; margin-left: auto; flex-shrink: 0; }
        .col-picker-btn {
          width: 26px; height: 22px; padding: 0; font-size: 14px;
          background: transparent; color: var(--text-muted); border-radius: 3px;
          display: flex; align-items: center; justify-content: center;
        }
        .col-picker-btn:hover { background: var(--row-hover); color: var(--text); }
        .col-picker-dropdown {
          position: absolute; right: 0; top: 26px; z-index: 200;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          min-width: 180px; padding: 6px 0;
        }
        .col-picker-title {
          padding: 4px 12px 6px; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);
          border-bottom: 1px solid var(--border); margin-bottom: 4px;
        }
        .col-picker-item {
          display: flex; align-items: center; gap: 8px;
          padding: 4px 12px; font-size: 12px; font-weight: 400;
          cursor: pointer; color: var(--text);
        }
        .col-picker-item:hover { background: var(--row-hover); }
        .col-picker-item input { accent-color: var(--accent); cursor: pointer; }
        .col-picker-actions {
          border-top: 1px solid var(--border); margin-top: 4px; padding: 6px 12px 2px;
        }
        .col-picker-actions button {
          font-size: 11px; background: var(--surface2); width: 100%;
        }
      `}</style>
    </div>
  );
}
