import { invoke } from "@tauri-apps/api/core";
import { ComicFile, ComicMeta, BulkEdit, PageEntry } from "./types";

type Listener = () => void;

export interface StoreSnapshot {
  files: ComicFile[];
  selected: Set<string>;
}

class Store {
  files: ComicFile[] = [];
  selected: Set<string> = new Set();
  snapshot: StoreSnapshot = { files: this.files, selected: this.selected };
  private listeners: Set<Listener> = new Set();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.snapshot = { files: this.files, selected: this.selected };
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
        originalMeta: {},
        pages: [],
        originalPages: [],
        dirty: false,
        loading: true,
      }));

    this.files = [...this.files, ...newEntries];
    this.notify();

    await Promise.all(
      newEntries.map(async (entry) => {
        try {
          const result: { meta: ComicMeta; pages: PageEntry[] } = await invoke("load_cbz", {
            path: entry.path,
          });
          entry.meta = result.meta;
          entry.originalMeta = { ...result.meta };
          entry.pages = result.pages;
          entry.originalPages = result.pages.map((p) => ({ ...p }));
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

  discardFile(id: string) {
    const file = this.files.find((f) => f.id === id);
    if (!file) return;
    file.meta = { ...file.originalMeta };
    file.pages = file.originalPages.map((p) => ({ ...p }));
    file.dirty = false;
    this.notify();
  }

  applyTransform(ids: string[], transform: (file: ComicFile) => Partial<ComicMeta>) {
    ids.forEach((id) => {
      const file = this.files.find((f) => f.id === id);
      if (!file) return;
      file.meta = { ...file.meta, ...transform(file) };
      file.dirty = true;
    });
    this.notify();
  }

  applyNumbering(orderedIds: string[], startNumber: number) {
    orderedIds.forEach((id, i) => {
      const file = this.files.find((f) => f.id === id);
      if (!file) return;
      file.meta = { ...file.meta, number: String(startNumber + i) };
      file.dirty = true;
    });
    this.notify();
  }

  discardAll() {
    this.files.filter((f) => f.dirty).forEach((file) => {
      file.meta = { ...file.originalMeta };
      file.pages = file.originalPages.map((p) => ({ ...p }));
      file.dirty = false;
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

  updatePage(id: string, pageIndex: number, patch: Partial<PageEntry>) {
    const file = this.files.find((f) => f.id === id);
    if (!file) return;
    file.pages = file.pages.map((p, i) => i === pageIndex ? { ...p, ...patch } : p);
    file.dirty = true;
    this.notify();
  }

  removePages(id: string, pageIndices: number[]) {
    const file = this.files.find((f) => f.id === id);
    if (!file) return;
    const set = new Set(pageIndices);
    file.pages = file.pages
      .filter((_, i) => !set.has(i))
      .map((p, i) => ({ ...p, index: i }));
    file.dirty = true;
    this.notify();
  }

  addPages(id: string, imagePaths: string[]) {
    const file = this.files.find((f) => f.id === id);
    if (!file) return;
    const newPages: PageEntry[] = imagePaths.map((p, i) => ({
      filename: p.replace(/\\/g, "/").split("/").pop() ?? p,
      index: file.pages.length + i,
      sourcePath: p,
    }));
    file.pages = [...file.pages, ...newPages];
    file.dirty = true;
    this.notify();
  }

  async saveFile(id: string) {
    const file = this.files.find((f) => f.id === id);
    if (!file || !file.dirty) return;

    await invoke("save_cbz", { path: file.path, meta: file.meta, pages: file.pages });

    // Reload from disk so the displayed data reflects exactly what was written
    try {
      const result: { meta: ComicMeta; pages: PageEntry[] } = await invoke("load_cbz", { path: file.path });
      file.meta          = result.meta;
      file.originalMeta  = { ...result.meta };
      file.pages         = result.pages;
      file.originalPages = result.pages.map((p) => ({ ...p }));
    } catch {
      // Reload failed — keep in-memory state as baseline
      file.originalMeta  = { ...file.meta };
      file.originalPages = file.pages.map((p) => ({ ...p }));
    }

    file.dirty = false;
    this.notify();
  }

  async saveAll() {
    // Sequential — parallel large-file I/O degrades throughput noticeably
    for (const file of this.files.filter((f) => f.dirty)) {
      await this.saveFile(file.id);
    }
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
      this.selected =
        this.selected.has(id) && this.selected.size === 1 ? new Set() : new Set([id]);
    }
    this.notify();
  }
}

export const store = new Store();

import { useSyncExternalStore } from "react";

export function useStore() {
  return useSyncExternalStore(
    (fn) => store.subscribe(fn),
    () => store.snapshot
  );
}
