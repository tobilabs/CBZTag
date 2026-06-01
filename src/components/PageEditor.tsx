import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { store } from "../store";
import { ComicFile, PAGE_TYPES, PageType } from "../types";

interface Props {
  file: ComicFile;
}

export function PageEditor({ file }: Props) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggleSelect(i: number, e: React.MouseEvent) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.metaKey || e.ctrlKey) {
        next.has(i) ? next.delete(i) : next.add(i);
      } else {
        return next.size === 1 && next.has(i) ? new Set() : new Set([i]);
      }
      return next;
    });
  }

  function handleDragStart(index: number) {
    setDragging(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOver(index);
  }

  function handleDrop(toIndex: number) {
    if (dragging !== null && dragging !== toIndex) {
      store.reorderPages(file.id, dragging, toIndex);
      // keep selection on moved item
      setSelected(new Set([toIndex]));
    }
    setDragging(null);
    setDragOver(null);
  }

  function handleDragEnd() {
    setDragging(null);
    setDragOver(null);
  }

  async function handleAddPages() {
    const result = await open({
      multiple: true,
      filters: [{ name: "Bilder", extensions: ["jpg", "jpeg", "png", "gif", "webp", "avif"] }],
    });
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    await store.addPages(file.id, paths);
  }

  function handleRemove() {
    const indices = [...selected].sort((a, b) => b - a);
    store.removePages(file.id, indices);
    setSelected(new Set());
  }

  function handleTypeChange(i: number, value: string) {
    store.updatePage(file.id, i, { pageType: value === "" ? undefined : (value as PageType) });
  }

  function handleDoublePageChange(i: number, checked: boolean) {
    store.updatePage(file.id, i, { doublePage: checked || undefined });
  }

  return (
    <div className="page-editor">
      <div className="page-editor-header">
        <span>{file.pages.length} Seiten</span>
        <div className="page-actions">
          {selected.size > 0 && (
            <button onClick={handleRemove} className="danger">
              {selected.size} entfernen
            </button>
          )}
          <button onClick={handleAddPages}>+ Seiten hinzufügen</button>
        </div>
      </div>
      <div className="page-list-header">
        <span className="col-num">#</span>
        <span className="col-name">Dateiname</span>
        <span className="col-type">Typ</span>
        <span className="col-dp" title="Doppelseite">2x</span>
        <span className="col-drag" />
      </div>
      <div className="page-list">
        {file.pages.map((page, i) => (
          <div
            key={page.filename}
            className={[
              "page-row",
              dragging === i ? "dragging" : "",
              dragOver === i ? "drag-over" : "",
              selected.has(i) ? "selected" : "",
            ].filter(Boolean).join(" ")}
            onClick={(e) => toggleSelect(i, e)}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
          >
            <span className="col-num">{i + 1}</span>
            <span className="col-name" title={page.filename}>{page.filename}</span>
            <select
              className="col-type"
              value={page.pageType ?? ""}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => handleTypeChange(i, e.target.value)}
            >
              <option value="">—</option>
              {PAGE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="checkbox"
              className="col-dp"
              checked={page.doublePage ?? false}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => handleDoublePageChange(i, e.target.checked)}
            />
            <span className="col-drag drag-handle">⠿</span>
          </div>
        ))}
        {file.pages.length === 0 && (
          <div className="page-empty">
            Keine Seiten — klicke „+ Seiten hinzufügen"
          </div>
        )}
      </div>
      <style>{`
        .page-editor {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        .page-editor-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          border-bottom: 1px solid var(--border);
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
          gap: 6px;
        }
        .page-actions { display: flex; gap: 6px; }
        button.danger { background: #7a1a2a; }
        button.danger:hover { background: var(--accent); }
        .page-list-header {
          display: flex;
          align-items: center;
          padding: 2px 10px;
          border-bottom: 1px solid var(--border);
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          flex-shrink: 0;
          user-select: none;
        }
        .page-list {
          flex: 1;
          overflow-y: auto;
        }
        .page-row {
          display: flex;
          align-items: center;
          padding: 2px 10px;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
          cursor: pointer;
          user-select: none;
          gap: 4px;
        }
        .page-row:hover { background: var(--row-hover); }
        .page-row.selected { background: var(--row-selected); }
        .page-row.dragging { opacity: 0.35; }
        .page-row.drag-over { border-top: 2px solid var(--accent); }
        .col-num {
          width: 28px;
          flex-shrink: 0;
          text-align: right;
          color: var(--text-muted);
          font-size: 11px;
        }
        .col-name {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding: 0 4px;
        }
        .col-type {
          width: 104px;
          flex-shrink: 0;
          font-size: 11px;
          padding: 1px 3px;
          cursor: pointer;
        }
        .col-dp {
          width: 22px;
          flex-shrink: 0;
          text-align: center;
          cursor: pointer;
          accent-color: var(--accent);
        }
        .col-drag {
          width: 18px;
          flex-shrink: 0;
          color: var(--text-muted);
          font-size: 14px;
          cursor: grab;
          text-align: center;
        }
        .page-empty {
          padding: 24px;
          text-align: center;
          color: var(--text-muted);
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
