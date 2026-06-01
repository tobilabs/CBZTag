export interface ComicMeta {
  title?: string;
  series?: string;
  number?: string;
  volume?: string;
  year?: string;
  month?: string;
  writer?: string;
  penciller?: string;
  inker?: string;
  colorist?: string;
  letterer?: string;
  coverArtist?: string;
  editor?: string;
  publisher?: string;
  imprint?: string;
  genre?: string;
  web?: string;
  pageCount?: string;
  languageISO?: string;
  format?: string;
  blackAndWhite?: string;
  manga?: string;
  characters?: string;
  teams?: string;
  locations?: string;
  storyArc?: string;
  seriesGroup?: string;
  ageRating?: string;
  summary?: string;
  notes?: string;
  scanInformation?: string;
  communityRating?: string;
}

export type PageType =
  | "Story"
  | "FrontCover"
  | "InnerCover"
  | "BackCover"
  | "Roundup"
  | "Advertisement"
  | "Editorial"
  | "Letters"
  | "Preview"
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
