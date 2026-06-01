import { invoke } from "@tauri-apps/api/core";
import { ComicFile, ComicMeta, BulkEdit } from "./types";

type Listener = () => void;

class Store {
  files: ComicFile[] = [];
  selected: Set<string> = new Set();
  private listeners: Set<Listener> = new Set();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  async openFiles(paths: string[]) {
    const newEntries: ComicFile[] = paths
      .filter((p) => !this.files.find((f) => f.path === p))
      .map((p) => ({
        id: crypto.randomUUID(),
        path: p,
        filename: p.split(/[\\/]/).pop() ?? p,
        meta: {},
        pages: [],
        dirty: false,
        loading: true,
      }));

    this.files = [...this.files, ...newEntries];
    this.notify();

    await Promise.all(
      newEntries.map(async (entry) => {
        try {
          const result: { meta: ComicMeta; pages: string[] } = await invoke("load_cbz", {
            path: entry.path,
          });
          entry.meta = result.meta;
          entry.pages = result.pages.map((filename, index) => ({ filename, index }));
          entry.loading = false;
        } catch (e) {
          entry.loading = false;
          entry.error = String(e);
        }
        this.notify();
      })
    );
  }

  updateMeta(id: string, meta: Partial<ComicMeta>) {
    const file = this.files.find((f) => f.id === id);
    if (!file) return;
    file.meta = { ...file.meta, ...meta };
    file.dirty = true;
    this.notify();
  }

  applyBulkEdits(ids: string[], edits: BulkEdit[]) {
    ids.forEach((id) => {
      const file = this.files.find((f) => f.id === id);
      if (!file) return;
      edits.forEach(({ field, value }) => {
        (file.meta as Record<string, string>)[field] = value;
      });
      file.dirty = true;
    });
    this.notify();
  }

  reorderPages(id: string, fromIndex: number, toIndex: number) {
    const file = this.files.find((f) => f.id === id);
    if (!file) return;
    const pages = [...file.pages];
    const [moved] = pages.splice(fromIndex, 1);
    pages.splice(toIndex, 0, moved);
    file.pages = pages.map((p, i) => ({ ...p, index: i }));
    file.dirty = true;
    this.notify();
  }

  async saveFile(id: string) {
    const file = this.files.find((f) => f.id === id);
    if (!file || !file.dirty) return;
    await invoke("save_cbz", {
      path: file.path,
      meta: file.meta,
      pageOrder: file.pages.map((p) => p.filename),
    });
    file.dirty = false;
    this.notify();
  }

  async saveAll() {
    await Promise.all(
      this.files.filter((f) => f.dirty).map((f) => this.saveFile(f.id))
    );
  }

  removeFiles(ids: string[]) {
    this.files = this.files.filter((f) => !ids.includes(f.id));
    ids.forEach((id) => this.selected.delete(id));
    this.notify();
  }

  setSelected(ids: Set<string>) {
    this.selected = ids;
    this.notify();
  }

  toggleSelected(id: string, multi: boolean) {
    if (multi) {
      const next = new Set(this.selected);
      next.has(id) ? next.delete(id) : next.add(id);
      this.selected = next;
    } else {
      this.selected = this.selected.has(id) && this.selected.size === 1
        ? new Set()
        : new Set([id]);
    }
    this.notify();
  }
}

export const store = new Store();

import { useSyncExternalStore } from "react";

export function useStore() {
  return useSyncExternalStore(
    (fn) => store.subscribe(fn),
    () => ({ files: store.files, selected: store.selected })
  );
}
