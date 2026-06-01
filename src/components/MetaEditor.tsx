import { useState, useEffect } from "react";
import { store } from "../store";
import { ComicFile, ComicMeta } from "../types";

interface FieldDef {
  key: keyof ComicMeta;
  label: string;
  multiline?: boolean;
  options?: string[];
}

const FIELDS: FieldDef[] = [
  { key: "title", label: "Titel" },
  { key: "series", label: "Serie" },
  { key: "number", label: "Nummer" },
  { key: "volume", label: "Band" },
  { key: "year", label: "Jahr" },
  { key: "month", label: "Monat" },
  { key: "publisher", label: "Verlag" },
  { key: "imprint", label: "Imprint" },
  { key: "writer", label: "Autor" },
  { key: "penciller", label: "Zeichner" },
  { key: "inker", label: "Inker" },
  { key: "colorist", label: "Colorist" },
  { key: "letterer", label: "Letterer" },
  { key: "coverArtist", label: "Cover-Künstler" },
  { key: "editor", label: "Editor" },
  { key: "genre", label: "Genre" },
  { key: "languageISO", label: "Sprache (ISO)" },
  { key: "format", label: "Format" },
  { key: "ageRating", label: "Altersfreigabe", options: ["Unknown", "Adults Only 18+", "Early Childhood", "Everyone", "Everyone 10+", "G", "Kids to Adults", "M", "MA15+", "Mature 17+", "PG", "R18+", "Rating Pending", "Teen", "X18+"] },
  { key: "blackAndWhite", label: "Schwarz/Weiß", options: ["Unknown", "Yes", "No"] },
  { key: "manga", label: "Manga", options: ["Unknown", "Yes", "YesAndRightToLeft", "No"] },
  { key: "storyArc", label: "Story Arc" },
  { key: "seriesGroup", label: "Seriengruppe" },
  { key: "characters", label: "Charaktere" },
  { key: "teams", label: "Teams" },
  { key: "locations", label: "Orte" },
  { key: "web", label: "Web-URL" },
  { key: "communityRating", label: "Bewertung" },
  { key: "summary", label: "Zusammenfassung", multiline: true },
  { key: "notes", label: "Notizen", multiline: true },
  { key: "scanInformation", label: "Scan-Info", multiline: true },
];

function getMixedValue(files: ComicFile[], key: keyof ComicMeta): string {
  const values = files.map((f) => f.meta[key] ?? "");
  const unique = new Set(values);
  return unique.size === 1 ? (values[0] ?? "") : "";
}

function isMixed(files: ComicFile[], key: keyof ComicMeta): boolean {
  const values = files.map((f) => f.meta[key] ?? "");
  return new Set(values).size > 1;
}

interface Props {
  files: ComicFile[];
}

export function MetaEditor({ files }: Props) {
  const isMulti = files.length > 1;
  const [localMeta, setLocalMeta] = useState<Partial<ComicMeta>>({});

  useEffect(() => {
    const meta: Partial<ComicMeta> = {};
    FIELDS.forEach(({ key }) => {
      if (!isMixed(files, key)) {
        meta[key] = getMixedValue(files, key);
      }
    });
    setLocalMeta(meta);
  }, [files.map((f) => f.id).join(",")]);

  function handleChange(key: keyof ComicMeta, value: string) {
    setLocalMeta((m) => ({ ...m, [key]: value }));
    if (isMulti) {
      files.forEach((f) => store.updateMeta(f.id, { [key]: value }));
    } else {
      store.updateMeta(files[0].id, { [key]: value });
    }
  }

  function handleSave() {
    files.forEach((f) => store.saveFile(f.id));
  }

  const dirty = files.some((f) => f.dirty);

  return (
    <div className="meta-editor">
      <div className="meta-header">
        <span>{isMulti ? `${files.length} Dateien ausgewählt` : files[0].filename}</span>
        <button className="primary" onClick={handleSave} disabled={!dirty}>
          Speichern{dirty ? " *" : ""}
        </button>
      </div>
      <div className="meta-fields">
        {FIELDS.map(({ key, label, multiline, options }) => {
          const mixed = isMixed(files, key);
          const value = localMeta[key] ?? "";
          return (
            <div key={key} className="field-row">
              <label className={mixed ? "label mixed" : "label"}>{label}{mixed ? " (gemischt)" : ""}</label>
              {options ? (
                <select
                  value={value}
                  onChange={(e) => handleChange(key, e.target.value)}
                >
                  {mixed && <option value="">— gemischt —</option>}
                  {options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
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
        .meta-editor {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        .meta-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .meta-fields {
          flex: 1;
          overflow-y: auto;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-row {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .label {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .label.mixed { color: var(--accent); }
        .field-row input,
        .field-row select,
        .field-row textarea {
          width: 100%;
          font-size: 12px;
        }
        .field-row textarea { resize: vertical; }
      `}</style>
    </div>
  );
}
