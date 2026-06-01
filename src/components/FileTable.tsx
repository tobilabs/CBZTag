import { useState, useRef, useCallback } from "react";
import { store, useStore } from "../store";
import { SortField, SortDir } from "../types";

const COLUMNS: { key: SortField; label: string; width: number }[] = [
  { key: "title",     label: "Titel",    width: 220 },
  { key: "series",    label: "Serie",    width: 160 },
  { key: "number",    label: "#",        width: 50  },
  { key: "year",      label: "Jahr",     width: 60  },
  { key: "publisher", label: "Verlag",   width: 120 },
];

export function FileTable() {
  const { files, selected } = useStore();
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir,   setSortDir]   = useState<SortDir>("asc");
  // Index within `sorted` of the anchor row (last non-shift click / arrow move)
  const anchorIdx = useRef<number>(-1);
  const bodyRef   = useRef<HTMLDivElement>(null);

  const sorted = [...files].sort((a, b) => {
    const av = a.meta[sortField] ?? a.filename;
    const bv = b.meta[sortField] ?? b.filename;
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  // ── Selection helpers ──────────────────────────────────────────────────────

  function selectSingle(idx: number) {
    anchorIdx.current = idx;
    store.setSelected(new Set([sorted[idx].id]));
  }

  function selectRange(from: number, to: number) {
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    const ids = sorted.slice(lo, hi + 1).map((f) => f.id);
    store.setSelected(new Set(ids));
  }

  function toggleOne(idx: number) {
    anchorIdx.current = idx;
    const next = new Set(selected);
    next.has(sorted[idx].id) ? next.delete(sorted[idx].id) : next.add(sorted[idx].id);
    store.setSelected(next);
  }

  // ── Mouse ──────────────────────────────────────────────────────────────────

  function handleRowClick(idx: number, e: React.MouseEvent) {
    if (e.shiftKey && anchorIdx.current >= 0) {
      selectRange(anchorIdx.current, idx);
    } else if (e.metaKey || e.ctrlKey) {
      toggleOne(idx);
    } else {
      selectSingle(idx);
    }
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (sorted.length === 0) return;

    const ctrl = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd+A — select all
    if (ctrl && e.key === "a") {
      e.preventDefault();
      anchorIdx.current = 0;
      store.setSelected(new Set(sorted.map((f) => f.id)));
      return;
    }

    // Delete / Backspace — remove selected from list
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selected.size > 0) {
        e.preventDefault();
        store.removeFiles([...selected]);
        anchorIdx.current = -1;
      }
      return;
    }

    // Arrow keys
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;

      // Determine current "cursor" position
      let cursor = anchorIdx.current;
      if (cursor < 0) {
        cursor = dir === 1 ? 0 : sorted.length - 1;
      } else {
        cursor = Math.max(0, Math.min(sorted.length - 1, cursor + dir));
      }

      if (e.shiftKey && anchorIdx.current >= 0) {
        // Extend selection from original anchor to new cursor
        selectRange(anchorIdx.current, cursor);
        // Don't update anchor on shift-arrow
      } else {
        selectSingle(cursor);
      }

      // Scroll the focused row into view
      const row = bodyRef.current?.children[cursor] as HTMLElement | undefined;
      row?.scrollIntoView({ block: "nearest" });
      return;
    }
  }, [sorted, selected]);

  // ── Sort ───────────────────────────────────────────────────────────────────

  function handleSort(field: SortField) {
    if (field === sortField) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="file-table-wrap"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      // Prevent browser text-selection on Ctrl+A / Shift+click / arrow keys
      onMouseDown={(e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); }}
    >
      <div className="file-table-header">
        <div className="col col-status" />
        <div className="col col-filename">Dateiname</div>
        {COLUMNS.map((c) => (
          <div
            key={c.key}
            className={`col sortable${sortField === c.key ? " sorted" : ""}`}
            style={{ width: c.width }}
            onClick={() => handleSort(c.key)}
          >
            {c.label}
            {sortField === c.key && (
              <span className="sort-arrow">{sortDir === "asc" ? " ▲" : " ▼"}</span>
            )}
          </div>
        ))}
      </div>

      <div className="file-table-body" ref={bodyRef}>
        {sorted.length === 0 && (
          <div className="table-empty">Keine Dateien geladen</div>
        )}
        {sorted.map((file, idx) => (
          <div
            key={file.id}
            className={[
              "file-row",
              selected.has(file.id) ? "selected" : "",
              file.dirty ? "dirty" : "",
            ].filter(Boolean).join(" ")}
            onClick={(e) => handleRowClick(idx, e)}
          >
            <div className="col col-status">
              {file.loading && <span title="Lädt…">⏳</span>}
              {file.error   && <span title={file.error}>⚠</span>}
              {file.dirty && !file.loading && <span title="Ungespeichert">●</span>}
            </div>
            <div className="col col-filename" title={file.path}>{file.filename}</div>
            {COLUMNS.map((c) => (
              <div key={c.key} className="col" style={{ width: c.width }}>
                {file.meta[c.key] ?? ""}
              </div>
            ))}
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
          user-select: none; flex-shrink: 0;
        }
        .file-table-body { flex: 1; overflow-y: auto; }
        .col { padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .col-status   { width: 22px; flex-shrink: 0; font-size: 10px; }
        .col-filename { flex: 1; min-width: 0; }
        .sortable { cursor: pointer; flex-shrink: 0; }
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
        .table-empty {
          padding: 32px; text-align: center;
          color: var(--text-muted); font-size: 12px;
        }
      `}</style>
    </div>
  );
}
