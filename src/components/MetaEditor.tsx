import { useState, useEffect, useMemo } from "react";
import { store } from "../store";
import { ComicFile, ComicMeta } from "../types";

interface FieldDef {
  key: keyof ComicMeta;
  label: string;
  multiline?: boolean;
  options?: string[];
  hint?: string;
}

// Fields in ComicInfo v2.0 schema sequence order
const FIELDS: FieldDef[] = [
  { key: "title",               label: "Titel" },
  { key: "series",              label: "Serie" },
  { key: "number",              label: "Nummer" },
  { key: "count",               label: "Gesamt (Count)", hint: "Ganzzahl" },
  { key: "volume",              label: "Band (Volume)",  hint: "Ganzzahl" },
  { key: "alternateSeries",     label: "Alternate Series" },
  { key: "alternateNumber",     label: "Alternate Number" },
  { key: "alternateCount",      label: "Alternate Count", hint: "Ganzzahl" },
  { key: "summary",             label: "Zusammenfassung", multiline: true },
  { key: "notes",               label: "Notizen",         multiline: true },
  { key: "year",                label: "Jahr",  hint: "Ganzzahl" },
  { key: "month",               label: "Monat", hint: "1–12" },
  { key: "day",                 label: "Tag",   hint: "1–31" },
  { key: "writer",              label: "Autor (Writer)" },
  { key: "penciller",           label: "Zeichner (Penciller)" },
  { key: "inker",               label: "Inker" },
  { key: "colorist",            label: "Colorist" },
  { key: "letterer",            label: "Letterer" },
  { key: "coverArtist",         label: "Cover-Künstler" },
  { key: "editor",              label: "Editor" },
  { key: "translator",          label: "Übersetzer (Translator)" },
  { key: "publisher",           label: "Verlag (Publisher)" },
  { key: "imprint",             label: "Imprint" },
  { key: "genre",               label: "Genre", hint: "Komma-getrennt" },
  { key: "tags",                label: "Tags",  hint: "Komma-getrennt" },
  { key: "web",                 label: "Web-URL" },
  { key: "languageISO",         label: "Sprache (BCP 47)", hint: "z.B. de, en, fr" },
  { key: "format",              label: "Format", hint: "z.B. TBP, HC, Web, Digital" },
  {
    key: "blackAndWhite",
    label: "Schwarz/Weiß",
    options: ["Unknown", "No", "Yes"],
  },
  {
    key: "manga",
    label: "Manga",
    options: ["Unknown", "No", "Yes", "YesAndRightToLeft"],
  },
  { key: "characters",          label: "Charaktere", hint: "Komma-getrennt" },
  { key: "teams",               label: "Teams",      hint: "Komma-getrennt" },
  { key: "locations",           label: "Orte",       hint: "Komma-getrennt" },
  { key: "scanInformation",     label: "Scan-Info",  multiline: true },
  { key: "storyArc",            label: "Story Arc",  hint: "Komma-getrennt" },
  { key: "storyArcNumber",      label: "Story Arc Nummer", hint: "Komma-getrennt" },
  { key: "seriesGroup",         label: "Seriengruppe", hint: "Komma-getrennt" },
  {
    key: "ageRating",
    label: "Altersfreigabe",
    options: [
      "Unknown", "Adults Only 18+", "Early Childhood", "Everyone",
      "Everyone 10+", "G", "Kids to Adults", "M", "MA15+",
      "Mature 17+", "PG", "R18+", "Rating Pending", "Teen", "X18+",
    ],
  },
  { key: "communityRating",     label: "Community-Bewertung", hint: "0.0–5.0" },
  { key: "mainCharacterOrTeam", label: "Hauptcharakter/-team" },
  { key: "review",              label: "Rezension", multiline: true },
];

function getMixed(files: ComicFile[], key: keyof ComicMeta): string {
  const vals = files.map((f) => f.meta[key] ?? "");
  return new Set(vals).size === 1 ? (vals[0] ?? "") : "";
}

function isMixed(files: ComicFile[], key: keyof ComicMeta): boolean {
  return new Set(files.map((f) => f.meta[key] ?? "")).size > 1;
}

interface Props { files: ComicFile[] }

export function MetaEditor({ files }: Props) {
  const isMulti = files.length > 1;
  const [local, setLocal] = useState<Partial<ComicMeta>>({});

  const selectionKey = useMemo(() => files.map((f) => f.id).join(","), [files]);

  useEffect(() => {
    const m: Partial<ComicMeta> = {};
    FIELDS.forEach(({ key }) => {
      if (!isMixed(files, key)) (m as Record<string, string>)[key] = getMixed(files, key);
    });
    setLocal(m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  function handleChange(key: keyof ComicMeta, value: string) {
    setLocal((m) => ({ ...m, [key]: value }));
    // bulkUpdateMeta applies to all selected files with a single notify
    store.bulkUpdateMeta(files.map((f) => f.id), { [key]: value });
  }

  function handleDiscard() {
    files.forEach((f) => store.discardFile(f.id));
    // Re-sync local state from freshly-reverted files
    const m: Partial<ComicMeta> = {};
    FIELDS.forEach(({ key }) => {
      const reverted = files.map((f) => f.originalMeta[key] ?? "");
      if (new Set(reverted).size === 1) (m as Record<string, string>)[key] = reverted[0] ?? "";
    });
    setLocal(m);
  }

  const dirty = files.some((f) => f.dirty);

  return (
    <div className="meta-editor">
      {isMulti && (
        <div className="bulk-banner">
          <span>✦ Bulk-Edit — {files.length} Dateien ausgewählt</span>
          <span className="bulk-hint">Änderungen gelten für alle markierten Dateien</span>
        </div>
      )}
      <div className="meta-header">
        <span className="meta-title">
          {isMulti ? `${files.length} Dateien` : files[0].filename}
        </span>
        <div className="meta-actions">
          <button onClick={handleDiscard} disabled={!dirty} className="discard-btn">
            Verwerfen
          </button>
          <button className="primary" onClick={() => store.saveAll(files.map((f) => f.id))} disabled={!dirty}>
            Speichern{dirty ? " *" : ""}
          </button>
        </div>
      </div>
      <div className="meta-fields">
        {FIELDS.map(({ key, label, multiline, options, hint }) => {
          const mixed = isMixed(files, key);
          const value = (local as Record<string, string>)[key] ?? "";
          return (
            <div key={key} className="field-row">
              <label className={mixed ? "label mixed" : "label"}>
                {label}
                {hint && <span className="field-hint"> · {hint}</span>}
                {mixed && <span className="mixed-badge"> gemischt</span>}
              </label>
              {options ? (
                <select value={value} onChange={(e) => handleChange(key, e.target.value)}>
                  {mixed && <option value="">— gemischt —</option>}
                  <option value="">—</option>
                  {options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : multiline ? (
                <textarea
                  rows={3}
                  placeholder={mixed ? "— gemischt —" : ""}
                  value={value}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
              ) : (
                <input
                  type="text"
                  placeholder={mixed ? "— gemischt —" : ""}
                  value={value}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>
      <style>{`
        .meta-editor { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .bulk-banner {
          display: flex; flex-direction: column; gap: 2px;
          padding: 6px 12px; background: #1a2a3e;
          border-bottom: 1px solid #2a4a6e; flex-shrink: 0;
        }
        .bulk-banner span { font-size: 11px; color: #6ab0f5; font-weight: 600; }
        .bulk-banner .bulk-hint { font-size: 10px; color: var(--text-muted); font-weight: 400; }
        .meta-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 7px 12px; border-bottom: 1px solid var(--border);
          flex-shrink: 0; gap: 8px;
        }
        .meta-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .discard-btn { background: #3a2a1a; color: #e8a055; }
        .discard-btn:hover:not(:disabled) { background: #7a4a10; }
        .meta-title { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .meta-fields { flex: 1; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; }
        .field-row { display: flex; flex-direction: column; gap: 2px; }
        .label { font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
        .label.mixed { color: var(--accent); }
        .field-hint { font-weight: 400; text-transform: none; letter-spacing: 0; opacity: 0.7; }
        .mixed-badge {
          display: inline-block; font-size: 9px; padding: 0 4px; margin-left: 4px;
          background: var(--accent); color: #fff; border-radius: 3px;
          text-transform: none; letter-spacing: 0;
        }
        .field-row input, .field-row select, .field-row textarea { width: 100%; font-size: 12px; }
        .field-row textarea { resize: vertical; }
      `}</style>
    </div>
  );
}
