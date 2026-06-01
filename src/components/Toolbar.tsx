interface Props {
  onOpenFiles: () => void;
  onOpenFolder: () => void;
  onSaveAll: () => void;
  onDiscardAll: () => void;
  onRemoveSelected: () => void;
  dirtyCount: number;
  selectedCount: number;
}

export function Toolbar({
  onOpenFiles, onOpenFolder, onSaveAll, onDiscardAll,
  onRemoveSelected, dirtyCount, selectedCount,
}: Props) {
  return (
    <div className="toolbar">
      <span className="toolbar-brand">CBZTag</span>
      <div className="toolbar-sep" />
      <button onClick={onOpenFiles}>+ Dateien öffnen</button>
      <button onClick={onOpenFolder}>+ Ordner öffnen</button>
      <div className="toolbar-sep" />
      <button className="primary" onClick={onSaveAll} disabled={dirtyCount === 0}>
        Alles speichern{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
      </button>
      <button onClick={onDiscardAll} disabled={dirtyCount === 0} className="discard">
        Alles verwerfen{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
      </button>
      {selectedCount > 0 && (
        <button onClick={onRemoveSelected} className="remove">
          {selectedCount} entfernen
        </button>
      )}
      <style>{`
        .toolbar {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 10px; background: var(--surface);
          border-bottom: 1px solid var(--border); height: 40px;
        }
        .toolbar-brand { font-weight: 700; font-size: 14px; color: var(--accent); letter-spacing: 0.5px; margin-right: 4px; }
        .toolbar-sep { width: 1px; height: 20px; background: var(--border); margin: 0 4px; }
        button.discard { background: #3a2a1a; color: #e8a055; }
        button.discard:hover:not(:disabled) { background: #7a4a10; }
        button.remove { margin-left: auto; }
      `}</style>
    </div>
  );
}
