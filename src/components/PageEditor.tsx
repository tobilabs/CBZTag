import { useState } from "react";
import { store } from "../store";
import { ComicFile } from "../types";

interface Props {
  file: ComicFile;
}

export function PageEditor({ file }: Props) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

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
    }
    setDragging(null);
    setDragOver(null);
  }

  function handleDragEnd() {
    setDragging(null);
    setDragOver(null);
  }

  return (
    <div className="page-editor">
      <div className="page-editor-header">
        <span>{file.pages.length} Seiten</span>
        <span className="hint">Drag & Drop zum Umsortieren</span>
      </div>
      <div className="page-list">
        {file.pages.map((page, i) => (
          <div
            key={page.filename}
            className={`page-row${dragging === i ? " dragging" : ""}${dragOver === i ? " drag-over" : ""}`}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
          >
            <span className="page-num">{i + 1}</span>
            <span className="page-name" title={page.filename}>{page.filename}</span>
            <span className="drag-handle">⠿</span>
          </div>
        ))}
        {file.pages.length === 0 && (
          <div className="page-empty">Keine Seiten</div>
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
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .page-editor-header .hint { font-size: 10px; font-style: italic; }
        .page-list {
          flex: 1;
          overflow-y: auto;
        }
        .page-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 12px;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
          cursor: grab;
          user-select: none;
        }
        .page-row:hover { background: var(--row-hover); }
        .page-row.dragging { opacity: 0.4; }
        .page-row.drag-over { border-top: 2px solid var(--accent); }
        .page-num {
          width: 32px;
          text-align: right;
          color: var(--text-muted);
          font-size: 11px;
          flex-shrink: 0;
        }
        .page-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .drag-handle { color: var(--text-muted); font-size: 14px; cursor: grab; }
        .page-empty { padding: 24px; text-align: center; color: var(--text-muted); }
      `}</style>
    </div>
  );
}
