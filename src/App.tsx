import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir } from "@tauri-apps/plugin-fs";
import { store, useStore } from "./store";
import { FileTable } from "./components/FileTable";
import { MetaEditor } from "./components/MetaEditor";
import { PageEditor } from "./components/PageEditor";
import { Toolbar } from "./components/Toolbar";
import "./App.css";

type Panel = "meta" | "pages";

export default function App() {
  const { files, selected } = useStore();
  const [panel, setPanel] = useState<Panel>("meta");

  const selectedFiles = files.filter((f) => selected.has(f.id));
  const singleFile = selectedFiles.length === 1 ? selectedFiles[0] : null;

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
      const entries = await readDir(result);
      const cbzPaths = entries
        .filter((e) => e.name?.toLowerCase().endsWith(".cbz"))
        .map((e) => `${result}/${e.name}`);
      if (cbzPaths.length > 0) await store.openFiles(cbzPaths);
    }
  }, []);

  const dirtyCount = files.filter((f) => f.dirty).length;

  return (
    <div className="app">
      <Toolbar
        onOpenFiles={handleOpenFiles}
        onOpenFolder={handleOpenFolder}
        onSaveAll={() => store.saveAll()}
        dirtyCount={dirtyCount}
        selectedCount={selected.size}
        onRemoveSelected={() => store.removeFiles([...selected])}
      />
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
              {panel === "meta" && (
                <MetaEditor files={selectedFiles} />
              )}
              {panel === "pages" && singleFile && (
                <PageEditor file={singleFile} />
              )}
            </>
          ) : (
            <div className="empty-state">
              <p>Keine Datei ausgewählt</p>
              <p className="hint">Öffne CBZ-Dateien oder einen Ordner über die Toolbar.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
