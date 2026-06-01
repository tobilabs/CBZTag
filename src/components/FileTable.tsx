import { useState } from "react";
import { store, useStore } from "../store";
import { ComicFile, SortField, SortDir } from "../types";

const COLUMNS: { key: SortField; label: string; width: number }[] = [
  { key: "title", label: "Titel", width: 220 },
  { key: "series", label: "Serie", width: 160 },
  { key: "number", label: "#", width: 50 },
  { key: "year", label: "Jahr", width: 60 },
  { key: "publisher", label: "Verlag", width: 120 },
];

export function FileTable() {
  const { files, selected } = useStore();
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = [...files].sort((a, b) => {
    const av = a.meta[sortField] ?? a.filename;
    const bv = b.meta[sortField] ?? b.filename;
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function handleRowClick(file: ComicFile, e: React.MouseEvent) {
    store.toggleSelected(file.id, e.metaKey || e.ctrlKey || e.shiftKey);
  }

  return (
    <div className="file-table-wrap">
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
      <div className="file-table-body">
        {sorted.length === 0 && (
          <div className="table-empty">Keine Dateien geladen</div>
        )}
        {sorted.map((file) => (
          <div
            key={file.id}
            className={`file-row${selected.has(file.id) ? " selected" : ""}${file.dirty ? " dirty" : ""}`}
            onClick={(e) => handleRowClick(file, e)}
          >
            <div className="col col-status">
              {file.loading && <span title="Lädt…">⏳</span>}
              {file.error && <span title={file.error}>⚠</span>}
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
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg);
        }
        .file-table-header {
          display: flex;
          align-items: center;
          padding: 0 8px;
          height: 28px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          user-select: none;
          flex-shrink: 0;
        }
        .file-table-body {
          flex: 1;
          overflow-y: auto;
        }
        .col { padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .col-status { width: 22px; flex-shrink: 0; font-size: 10px; }
        .col-filename { flex: 1; min-width: 0; }
        .sortable { cursor: pointer; flex-shrink: 0; }
        .sortable:hover { color: var(--text); }
        .sort-arrow { color: var(--accent); }
        .file-row {
          display: flex;
          align-items: center;
          padding: 0 8px;
          height: 26px;
          cursor: pointer;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
        }
        .file-row:hover { background: var(--row-hover); }
        .file-row.selected { background: var(--row-selected); }
        .file-row.dirty .col-status { color: var(--accent); }
        .table-empty {
          padding: 32px;
          text-align: center;
          color: var(--text-muted);
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
