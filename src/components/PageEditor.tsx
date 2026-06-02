import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { store } from "../store";
import { ComicFile, PAGE_TYPES, PageType } from "../types";

interface Props {
  file: ComicFile;
}

interface TooltipState {
  dataUrl: string;
  x: number;
  y: number;
}

export function PageEditor({ file }: Props) {
  const [dragging, setDragging]     = useState<number | null>(null);
  const [dragOver, setDragOver]     = useState<number | null>(null);
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [tooltip, setTooltip]       = useState<TooltipState | null>(null);
  const thumbnailCache              = useRef<Map<string, string>>(new Map());
  const hoverTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Thumbnail ────────────────────────────────────────────────────────────

  const handleMouseEnter = useCallback(
    async (filename: string, e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const TOOLTIP_W = 228;
      const TOOLTIP_H = 320;
      // Show to the left of the panel; clamp so it doesn't go above the viewport
      const x = rect.left - TOOLTIP_W - 8;
      const y = Math.min(rect.top, window.innerHeight - TOOLTIP_H - 8);

      // Show immediately from cache, otherwise wait 120 ms before fetching
      const cached = thumbnailCache.current.get(filename);
      if (cached) {
        setTooltip({ dataUrl: cached, x, y });
        return;
      }

      hoverTimer.current = setTimeout(async () => {
        try {
          const dataUrl: string = await invoke("get_page_thumbnail", {
            path: file.path,
            filename,
          });
          thumbnailCache.current.set(filename, dataUrl);
          setTooltip({ dataUrl, x, y });
        } catch {
          // Silently ignore — no thumbnail shown
        }
      }, 120);
    },
    [file.path]
  );

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setTooltip(null);
  }, []);

  // ── Selection ────────────────────────────────────────────────────────────

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

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  function handleDragStart(index: number) {
    setDragging(index);
    setTooltip(null);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOver(index);
  }

  function handleDrop(toIndex: number) {
    if (dragging !== null && dragging !== toIndex) {
      store.reorderPages(file.id, dragging, toIndex);
      setSelected(new Set([toIndex]));
    }
    setDragging(null);
    setDragOver(null);
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleExtract() {
    const filenames = file.pages
      .filter((_, i) => selected.has(i))
      .map((p) => p.filename);
    if (filenames.length === 0) return;

    const destDir = await open({ directory: true, title: "Zielordner wählen" });
    if (typeof destDir !== "string") return;

    try {
      const written: string[] = await invoke("extract_pages", {
        path: file.path,
        filenames,
        destDir,
      });
      alert(`${written.length} Seite(n) extrahiert nach:\n${destDir}`);
    } catch (e) {
      alert(`Fehler beim Extrahieren:\n${e}`);
    }
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
    store.removePages(file.id, [...selected].sort((a, b) => b - a));
    setSelected(new Set());
  }

  function handleTypeChange(i: number, value: string) {
    store.updatePage(file.id, i, { pageType: value === "" ? undefined : (value as PageType) });
  }

  function handleDoublePageChange(i: number, checked: boolean) {
    store.updatePage(file.id, i, { doublePage: checked || undefined });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="page-editor">
      {/* Thumbnail tooltip — rendered outside scroll container */}
      {tooltip && (
        <div
          className="thumb-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <img src={tooltip.dataUrl} alt="" />
        </div>
      )}

      <div className="page-editor-header">
        <span>{file.pages.length} Seiten</span>
        <div className="page-actions">
          {selected.size > 0 && (
            <>
              <button onClick={handleExtract}>
                ↓ Extrahieren ({selected.size})
              </button>
              <button onClick={handleRemove} className="danger">
                {selected.size} entfernen
              </button>
            </>
          )}
          <button onClick={handleAddPages}>+ Hinzufügen</button>
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
              dragging === i   ? "dragging"  : "",
              dragOver === i   ? "drag-over" : "",
              selected.has(i)  ? "selected"  : "",
            ].filter(Boolean).join(" ")}
            onClick={(e) => toggleSelect(i, e)}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={() => { setDragging(null); setDragOver(null); }}
            onMouseEnter={(e) => handleMouseEnter(page.filename, e)}
            onMouseLeave={handleMouseLeave}
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
          <div className="page-empty">Keine Seiten — klicke „+ Hinzufügen"</div>
        )}
      </div>

      <style>{`
        .page-editor {
          display: flex; flex-direction: column; height: 100%; overflow: hidden; position: relative;
        }
        .thumb-tooltip {
          position: fixed;
          z-index: 1000;
          pointer-events: none;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 4px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          max-width: 220px;
          animation: fadeIn 0.1s ease;
        }
        .thumb-tooltip img {
          display: block;
          max-width: 210px;
          max-height: 300px;
          border-radius: 3px;
          object-fit: contain;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .page-editor-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 10px; border-bottom: 1px solid var(--border);
          font-size: 11px; color: var(--text-muted); flex-shrink: 0; gap: 6px;
        }
        .page-actions { display: flex; gap: 6px; }
        button.danger { background: #7a1a2a; }
        button.danger:hover { background: var(--accent); }
        .page-list-header {
          display: flex; align-items: center; padding: 2px 10px;
          border-bottom: 1px solid var(--border);
          font-size: 10px; font-weight: 600; color: var(--text-muted);
          text-transform: uppercase; flex-shrink: 0; user-select: none; gap: 4px;
        }
        .page-list { flex: 1; overflow-y: auto; }
        .page-row {
          display: flex; align-items: center; padding: 2px 10px;
          border-bottom: 1px solid var(--border);
          font-size: 12px; cursor: pointer; user-select: none; gap: 4px;
        }
        .page-row:hover { background: var(--row-hover); }
        .page-row.selected { background: var(--row-selected); }
        .page-row.dragging { opacity: 0.35; }
        .page-row.drag-over { border-top: 2px solid var(--accent); }
        .col-num { width: 28px; flex-shrink: 0; text-align: right; color: var(--text-muted); font-size: 11px; }
        .col-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; }
        .col-type { width: 104px; flex-shrink: 0; font-size: 11px; padding: 1px 3px; cursor: pointer; }
        .col-dp { width: 22px; flex-shrink: 0; text-align: center; cursor: pointer; accent-color: var(--accent); }
        .col-drag { width: 18px; flex-shrink: 0; color: var(--text-muted); font-size: 14px; cursor: grab; text-align: center; }
        .drag-handle { user-select: none; }
        .page-empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
      `}</style>
    </div>
  );
}
