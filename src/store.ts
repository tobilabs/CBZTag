import { invoke } from "@tauri-apps/api/core";
import { ComicFile, ComicMeta, BulkEdit, PageEntry } from "./types";

type Listener = () => void;

export interface StatusInfo {
  message: string;
  current: number;
  total: number;
}

export interface StoreSnapshot {
  files: ComicFile[];
  selected: Set<string>;
  status: StatusInfo | null;
}

class Store {
  files: ComicFile[] = [];
  /** O(1) lookup by id — kept in sync with `files` on every mutation. */
  private fileMap = new Map<string, ComicFile>();
  selected: Set<string> = new Set();
  status: StatusInfo | null = null;
  snapshot: StoreSnapshot = { files: [], selected: this.selected, status: null };
  private listeners: Set<Listener> = new Set();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.snapshot = { files: this.files, selected: this.selected, status: this.status };
    this.listeners.forEach((fn) => fn());
  }

  setStatus(s: StatusInfo | null) {
    this.status = s;
    this.notify();
  }

  private get(id: string): ComicFile | undefined {
    return this.fileMap.get(id);
  }

  // ── File loading ──────────────────────────────────────────────────────────

  async openFiles(paths: string[]) {
    // O(1) dedup using a Set
    const existingPaths = new Set(this.files.map((f) => f.path));
    const newEntries: ComicFile[] = paths
      .filter((p) => !existingPaths.has(p))
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

    if (newEntries.length === 0) return;

    newEntries.forEach((e) => this.fileMap.set(e.id, e));
    this.files = [...this.files, ...newEntries];
    const total = newEntries.length;
    let done = 0;
    this.setStatus({ message: "Lade Comics…", current: 0, total });

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
        done++;
        this.status = { message: "Lade Comics…", current: done, total };
        this.notify();
      })
    );

    this.setStatus(null);
  }

  // ── Meta mutations ────────────────────────────────────────────────────────

  updateMeta(id: string, meta: Partial<ComicMeta>) {
    const file = this.get(id);
    if (!file) return;
    file.meta = { ...file.meta, ...meta };
    file.dirty = true;
    this.notify();
  }

  /** Apply a patch to multiple files at once — single notify instead of N. */
  bulkUpdateMeta(ids: string[], meta: Partial<ComicMeta>) {
    ids.forEach((id) => {
      const file = this.get(id);
      if (!file) return;
      file.meta = { ...file.meta, ...meta };
      file.dirty = true;
    });
    this.notify();
  }

  applyTransform(ids: string[], transform: (file: ComicFile) => Partial<ComicMeta>) {
    ids.forEach((id) => {
      const file = this.get(id);
      if (!file) return;
      file.meta = { ...file.meta, ...transform(file) };
      file.dirty = true;
    });
    // setStatus calls notify — no separate notify needed
    this.setStatus({
      message: `${ids.length} Comic${ids.length !== 1 ? "s" : ""} aktualisiert`,
      current: ids.length, total: ids.length,
    });
    setTimeout(() => this.setStatus(null), 2500);
  }

  applyNumbering(orderedIds: string[], startNumber: number) {
    orderedIds.forEach((id, i) => {
      const file = this.get(id);
      if (!file) return;
      file.meta = { ...file.meta, number: String(startNumber + i) };
      file.dirty = true;
    });
    this.setStatus({
      message: `${orderedIds.length} Comic${orderedIds.length !== 1 ? "s" : ""} nummeriert`,
      current: orderedIds.length, total: orderedIds.length,
    });
    setTimeout(() => this.setStatus(null), 2500);
  }

  applyBulkEdits(ids: string[], edits: BulkEdit[]) {
    ids.forEach((id) => {
      const file = this.get(id);
      if (!file) return;
      edits.forEach(({ field, value }) => {
        (file.meta as Record<string, string>)[field] = value;
      });
      file.dirty = true;
    });
    this.notify();
  }

  // ── Discard ───────────────────────────────────────────────────────────────

  discardFile(id: string) {
    const file = this.get(id);
    if (!file) return;
    file.meta = { ...file.originalMeta };
    file.pages = file.originalPages.map((p) => ({ ...p }));
    file.dirty = false;
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

  // ── Page mutations ────────────────────────────────────────────────────────

  reorderPages(id: string, fromIndex: number, toIndex: number) {
    const file = this.get(id);
    if (!file) return;
    const pages = [...file.pages];
    const [moved] = pages.splice(fromIndex, 1);
    pages.splice(toIndex, 0, moved);
    file.pages = pages.map((p, i) => ({ ...p, index: i }));
    file.dirty = true;
    this.notify();
  }

  updatePage(id: string, pageIndex: number, patch: Partial<PageEntry>) {
    const file = this.get(id);
    if (!file) return;
    file.pages = file.pages.map((p, i) => i === pageIndex ? { ...p, ...patch } : p);
    file.dirty = true;
    this.notify();
  }

  removePages(id: string, pageIndices: number[]) {
    const file = this.get(id);
    if (!file) return;
    const set = new Set(pageIndices);
    file.pages = file.pages
      .filter((_, i) => !set.has(i))
      .map((p, i) => ({ ...p, index: i }));
    file.dirty = true;
    this.notify();
  }

  addPages(id: string, imagePaths: string[]) {
    const file = this.get(id);
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

  // ── Save ──────────────────────────────────────────────────────────────────

  async saveFile(id: string) {
    const file = this.get(id);
    if (!file || !file.dirty) return;

    await invoke("save_cbz", { path: file.path, meta: file.meta, pages: file.pages });

    try {
      const result: { meta: ComicMeta; pages: PageEntry[] } = await invoke("load_cbz", { path: file.path });
      file.meta          = result.meta;
      file.originalMeta  = { ...result.meta };
      file.pages         = result.pages;
      file.originalPages = result.pages.map((p) => ({ ...p }));
    } catch {
      file.originalMeta  = { ...file.meta };
      file.originalPages = file.pages.map((p) => ({ ...p }));
    }

    file.dirty = false;
    this.notify();
  }

  async saveAll(ids?: string[]) {
    const dirty = this.files.filter(
      (f) => f.dirty && (ids == null || ids.includes(f.id))
    );
    if (dirty.length === 0) return;
    let done = 0;
    this.setStatus({ message: "Speichere…", current: 0, total: dirty.length });
    for (const file of dirty) {
      await this.saveFile(file.id);
      done++;
      this.setStatus({ message: "Speichere…", current: done, total: dirty.length });
    }
    this.setStatus({
      message: `${dirty.length} Comic${dirty.length !== 1 ? "s" : ""} gespeichert`,
      current: dirty.length, total: dirty.length,
    });
    setTimeout(() => this.setStatus(null), 2500);
  }

  // ── List management ───────────────────────────────────────────────────────

  removeFiles(ids: string[]) {
    const set = new Set(ids);
    this.files = this.files.filter((f) => !set.has(f.id));
    ids.forEach((id) => { this.fileMap.delete(id); this.selected.delete(id); });
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
