// Fields in schema sequence order (ComicInfo v2.0)
export interface ComicMeta {
  title?: string;
  series?: string;
  number?: string;
  count?: string;           // xs:int — total books in series
  volume?: string;          // xs:int
  alternateSeries?: string;
  alternateNumber?: string;
  alternateCount?: string;  // xs:int
  summary?: string;
  notes?: string;
  year?: string;            // xs:int
  month?: string;           // xs:int
  day?: string;             // xs:int
  writer?: string;
  penciller?: string;
  inker?: string;
  colorist?: string;
  letterer?: string;
  coverArtist?: string;
  editor?: string;
  translator?: string;
  publisher?: string;
  imprint?: string;
  genre?: string;
  tags?: string;
  web?: string;
  // pageCount is derived from pages.len() — not user-editable
  languageISO?: string;
  format?: string;
  blackAndWhite?: "Unknown" | "No" | "Yes";
  manga?: "Unknown" | "No" | "Yes" | "YesAndRightToLeft";
  characters?: string;
  teams?: string;
  locations?: string;
  scanInformation?: string;
  storyArc?: string;
  storyArcNumber?: string;
  seriesGroup?: string;
  ageRating?: string;
  // Pages block handled separately
  communityRating?: string; // xs:decimal 0.0–5.0
  mainCharacterOrTeam?: string;
  review?: string;
}

export type PageType =
  | "FrontCover"
  | "InnerCover"
  | "Roundup"
  | "Story"
  | "Advertisement"
  | "Editorial"
  | "Letters"
  | "Preview"
  | "BackCover"
  | "Other"
  | "Deleted";

export const PAGE_TYPES: PageType[] = [
  "Story", "FrontCover", "InnerCover", "BackCover",
  "Roundup", "Advertisement", "Editorial", "Letters",
  "Preview", "Other", "Deleted",
];

export interface PageEntry {
  filename: string;
  index: number;
  pageType?: PageType;
  doublePage?: boolean;
}

export interface ComicFile {
  id: string;
  path: string;
  filename: string;
  meta: ComicMeta;
  pages: PageEntry[];
  dirty: boolean;
  loading: boolean;
  error?: string;
}

export type SortField = keyof Pick<ComicMeta, "title" | "series" | "number" | "year" | "publisher">;
export type SortDir = "asc" | "desc";

export interface BulkEdit {
  field: keyof ComicMeta;
  value: string;
}
