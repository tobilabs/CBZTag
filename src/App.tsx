import { useState, useCallback } from "react";
import type { DirEntry } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir } from "@tauri-apps/plugin-fs";
import { store, useStore } from "./store";
import { FileTable } from "./components/FileTable";
import { MetaEditor } from "./components/MetaEditor";
import { PageEditor } from "./components/PageEditor";
import { Toolbar } from "./components/Toolbar";
import { BulkOpsMenu } from "./components/BulkOpsMenu";
import { NumberingModal } from "./components/NumberingModal";
import { StatusBar } from "./components/StatusBar";
import "./App.css";

async function collectCbzFiles(dirPath: string): Promise<string[]> {
  const entries: DirEntry[] = await readDir(dirPath);
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = `${dirPath}/${entry.name}`;
    if (entry.isDirectory) {
      results.push(...await collectCbzFiles(fullPath));
    } else if (entry.name?.toLowerCase().endsWith(".cbz")) {
      results.push(fullPath);
    }
  }
  return results;
}

type Panel = "meta" | "pages";

export default function App() {
  const { files, selected, status } = useStore();
  const [panel, setPanel]               = useState<Panel>("meta");
  const [numberingOpen, setNumberingOpen] = useState(false);

  const selectedFiles = files.filter((f) => selected.has(f.id));
  const singleFile    = selectedFiles.length === 1 ? selectedFiles[0] : null;
  const dirtyCount    = files.filter((f) => f.dirty).length;

  // Auto-switch to meta when multi-select makes pages tab unavailable
  if (panel === "pages" && !singleFile) setPanel("meta");

  const handleOpenFiles = useCallback(async () => {
    const result = await open({
      multiple: true,
      filters: [{ name: "Comic Book Archive", extensions: ["cbz"] }],
    });
    if (result) {
      const paths = Array.isArray(result) ? result : [result];
      await store.openFiles(paths);
    }
  }, []);

  const handleOpenFolder = useCallback(async () => {
    const result = await open({ directory: true });
    if (typeof result === "string") {
      store.setStatus({ message: "Ordner wird durchsucht…", current: 0, total: 0 });
      const cbzPaths = await collectCbzFiles(result);
      if (cbzPaths.length > 0) {
        await store.openFiles(cbzPaths);
      } else {
        store.setStatus({ message: "Keine CBZ-Dateien gefunden", current: 0, total: 0 });
        setTimeout(() => store.setStatus(null), 2500);
      }
    }
  }, []);

  return (
    <div className="app">
      <Toolbar
        onOpenFiles={handleOpenFiles}
        onOpenFolder={handleOpenFolder}
        onSaveAll={() => store.saveAll()}
        onDiscardAll={() => store.discardAll()}
        dirtyCount={dirtyCount}
        selectedCount={selected.size}
        onRemoveSelected={() => store.removeFiles([...selected])}
      >
        {selectedFiles.length > 0 && (
          <BulkOpsMenu
            selectedIds={[...selected]}
            onOpenNumbering={() => setNumberingOpen(true)}
          />
        )}
      </Toolbar>

      <div className="workspace">
        <FileTable />
        <div className="detail-panel">
          {selectedFiles.length > 0 ? (
            <>
              <div className="panel-tabs">
                <button
                  className={panel === "meta" ? "tab active" : "tab"}
                  onClick={() => setPanel("meta")}
                >
                  Metadata
                </button>
                <button
                  className={panel === "pages" ? "tab active" : "tab"}
                  onClick={() => setPanel("pages")}
                  disabled={!singleFile}
                  title={!singleFile ? "Seiten-Editor nur für einzelne Auswahl" : ""}
                >
                  Pages
                </button>
              </div>
              {panel === "meta"  && <MetaEditor files={selectedFiles} />}
              {panel === "pages" && singleFile && <PageEditor file={singleFile} />}
            </>
          ) : (
            <div className="empty-state">
              <p>Keine Datei ausgewählt</p>
              <p className="hint">Öffne CBZ-Dateien oder einen Ordner über die Toolbar.</p>
            </div>
          )}
        </div>
      </div>

      <StatusBar status={status} fileCount={files.length} />

      {numberingOpen && (
        <NumberingModal
          files={selectedFiles}
          onClose={() => setNumberingOpen(false)}
        />
      )}
    </div>
  );
}
