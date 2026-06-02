use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Seek, Write};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

/// All fields in schema sequence order (ComicInfo v2.0).
/// Numeric fields (Count, Volume, Year, Month, Day, AlternateCount) are stored
/// as Option<String> so the UI can edit them as free text; they are written
/// verbatim into the XML (most readers are lenient about xs:int whitespace).
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComicMeta {
    pub title: Option<String>,
    pub series: Option<String>,
    pub number: Option<String>,
    pub count: Option<String>,
    pub volume: Option<String>,
    pub alternate_series: Option<String>,
    pub alternate_number: Option<String>,
    pub alternate_count: Option<String>,
    pub summary: Option<String>,
    pub notes: Option<String>,
    pub year: Option<String>,
    pub month: Option<String>,
    pub day: Option<String>,
    pub writer: Option<String>,
    pub penciller: Option<String>,
    pub inker: Option<String>,
    pub colorist: Option<String>,
    pub letterer: Option<String>,
    pub cover_artist: Option<String>,
    pub editor: Option<String>,
    pub translator: Option<String>,
    pub publisher: Option<String>,
    pub imprint: Option<String>,
    pub genre: Option<String>,
    pub tags: Option<String>,
    pub web: Option<String>,
    // PageCount is derived from pages.len() — not stored here
    pub language_iso: Option<String>,
    pub format: Option<String>,
    /// YesNo enum: "Unknown" | "No" | "Yes"
    pub black_and_white: Option<String>,
    /// Manga enum: "Unknown" | "No" | "Yes" | "YesAndRightToLeft"
    pub manga: Option<String>,
    pub characters: Option<String>,
    pub teams: Option<String>,
    pub locations: Option<String>,
    pub scan_information: Option<String>,
    pub story_arc: Option<String>,
    pub story_arc_number: Option<String>,
    pub series_group: Option<String>,
    pub age_rating: Option<String>,
    // Pages block is separate (see PageInfo)
    /// xs:decimal 0.0–5.0
    pub community_rating: Option<String>,
    pub main_character_or_team: Option<String>,
    pub review: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub filename: String,
    pub index: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub double_page: Option<bool>,
    /// Filesystem source path for pages not yet written into the CBZ.
    /// Present only for pending additions; absent for pages already in the archive.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LoadResult {
    pub meta: ComicMeta,
    pub pages: Vec<PageInfo>,
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Reads only ComicInfo.xml + lists image entries — never extracts images.
pub fn load_cbz(path: &str) -> Result<LoadResult> {
    let file = File::open(path).context("Datei öffnen")?;
    let mut archive = ZipArchive::new(file).context("ZIP öffnen")?;

    let names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|e| e.name().to_owned()))
        .collect();

    // Preserve ZIP entry order — this is the authoritative sequence that
    // Image="N" indices in ComicInfo.xml refer to after we write the file.
    // (Initial loads of third-party CBZs are typically already in filename order.)
    let image_names: Vec<String> = names
        .iter()
        .filter(|n| is_image(&n.to_lowercase()))
        .map(|n| n.rsplit('/').next().unwrap_or(n).to_owned())
        .collect();

    let comic_info_name = names
        .iter()
        .find(|n| n.to_lowercase() == "comicinfo.xml")
        .cloned();

    let mut meta = ComicMeta::default();
    let mut page_meta: HashMap<usize, (Option<String>, Option<bool>)> = HashMap::new();

    if let Some(ref xml_name) = comic_info_name {
        let mut entry = archive.by_name(xml_name).context("ComicInfo.xml lesen")?;
        let mut xml = String::new();
        entry.read_to_string(&mut xml)?;
        meta = parse_comic_info(&xml);
        page_meta = parse_pages_section(&xml);
    }

    let pages = image_names
        .into_iter()
        .enumerate()
        .map(|(i, filename)| {
            let (page_type, double_page) = page_meta.get(&i).cloned().unwrap_or((None, None));
            PageInfo { filename, index: i, page_type, double_page, source_path: None }
        })
        .collect();

    Ok(LoadResult { meta, pages })
}

/// Rewrites CBZ in-place: updates ComicInfo.xml, applies page order/removals.
/// Images are streamed without decompression; only ComicInfo.xml is regenerated.
pub fn save_cbz(path: &str, meta: &ComicMeta, pages: &[PageInfo]) -> Result<()> {
    let tmp_path = format!("{}.cbztag.tmp", path);
    {
        let src_file = File::open(path).context("Quelldatei öffnen")?;
        let mut src = ZipArchive::new(src_file).context("Quell-ZIP öffnen")?;
        let dst_file = File::create(&tmp_path).context("Temp-Datei erstellen")?;
        let mut dst = ZipWriter::new(dst_file);

        // basename → full zip entry name
        let name_map: HashMap<String, String> = (0..src.len())
            .filter_map(|i| {
                let e = src.by_index(i).ok()?;
                let name = e.name().to_owned();
                if is_image(&name.to_lowercase()) {
                    let base = name.rsplit('/').next().unwrap_or(&name).to_owned();
                    Some((base, name))
                } else {
                    None
                }
            })
            .collect();

        let stored_opts = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);

        for page in pages {
            if let Some(ref src_path) = page.source_path {
                // New page not yet in the CBZ — read from filesystem
                let mut data = Vec::new();
                File::open(src_path)
                    .with_context(|| format!("Neue Seite öffnen: {}", src_path))?
                    .read_to_end(&mut data)?;
                dst.start_file(&page.filename, stored_opts)?;
                dst.write_all(&data)?;
            } else {
                let src_name = name_map.get(&page.filename).map(|s| s.as_str()).unwrap_or(&page.filename);
                copy_entry(&mut src, &mut dst, src_name)?;
            }
        }

        // Copy non-image, non-ComicInfo entries (e.g. credits.txt)
        let all_names: Vec<String> = (0..src.len())
            .filter_map(|i| src.by_index(i).ok().map(|e| e.name().to_owned()))
            .collect();
        for name in &all_names {
            let lower = name.to_lowercase();
            if !is_image(&lower) && lower != "comicinfo.xml" {
                copy_entry(&mut src, &mut dst, name)?;
            }
        }

        let xml = build_comic_info(meta, pages);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        dst.start_file("ComicInfo.xml", opts)?;
        dst.write_all(xml.as_bytes())?;
        dst.finish()?;
    }
    fs::rename(&tmp_path, path).context("Atomisches Ersetzen")?;
    Ok(())
}


/// Returns a page as a base64 data URL.
/// `source_path` is set for pages not yet written into the CBZ (pending additions).
pub fn get_page_thumbnail(cbz_path: &str, filename: &str, source_path: Option<&str>) -> Result<String> {
    let bytes = if let Some(src) = source_path {
        // Page not yet in archive — read directly from filesystem
        let mut data = Vec::new();
        File::open(src).with_context(|| format!("Vorschau-Datei öffnen: {}", src))?
            .read_to_end(&mut data)?;
        data
    } else {
        let file = File::open(cbz_path).context("Datei öffnen")?;
        let mut archive = ZipArchive::new(file).context("ZIP öffnen")?;
        let entry_name: Option<String> = (0..archive.len()).find_map(|i| {
            let e = archive.by_index(i).ok()?;
            let name = e.name().to_owned();
            let base = name.rsplit('/').next().unwrap_or(&name).to_owned();
            if base == filename { Some(name) } else { None }
        });
        let entry_name = entry_name
            .ok_or_else(|| anyhow::anyhow!("Seite nicht gefunden: {}", filename))?;
        let mut entry = archive.by_name(&entry_name)?;
        let mut data = Vec::new();
        entry.read_to_end(&mut data)?;
        data
    };

    let ext = filename.rsplit('.').next().unwrap_or("jpg").to_lowercase();
    let mime = match ext.as_str() {
        "png"  => "image/png",
        "gif"  => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        _      => "image/jpeg",
    };
    use base64::Engine;
    Ok(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(&bytes)))
}

/// Extracts a subset of pages from a CBZ into `dest_dir`.
/// Pages with `source_path` set (pending additions) are copied directly from disk.
pub fn extract_pages(cbz_path: &str, pages: &[PageInfo], dest_dir: &str) -> Result<Vec<String>> {
    let dest = std::path::Path::new(dest_dir);
    fs::create_dir_all(dest).context("Zielordner anlegen")?;

    // Only open the archive if we actually need it
    let needs_archive = pages.iter().any(|p| p.source_path.is_none());
    let mut archive_opt: Option<ZipArchive<File>> = if needs_archive {
        let f = File::open(cbz_path).context("CBZ öffnen")?;
        Some(ZipArchive::new(f).context("ZIP öffnen")?)
    } else {
        None
    };

    let name_map: HashMap<String, String> = if let Some(ref mut a) = archive_opt {
        (0..a.len())
            .filter_map(|i| {
                let e = a.by_index(i).ok()?;
                let name = e.name().to_owned();
                if is_image(&name.to_lowercase()) {
                    let base = name.rsplit('/').next().unwrap_or(&name).to_owned();
                    Some((base, name))
                } else { None }
            })
            .collect()
    } else {
        HashMap::new()
    };

    let mut written = Vec::new();
    for page in pages {
        let out_path = dest.join(&page.filename);
        if let Some(ref src) = page.source_path {
            fs::copy(src, &out_path).with_context(|| format!("Kopieren von {}", src))?;
        } else if let Some(ref mut archive) = archive_opt {
            let entry_name = name_map.get(&page.filename).map(|s| s.as_str()).unwrap_or(&page.filename);
            if let Ok(mut entry) = archive.by_name(entry_name) {
                let mut out = File::create(&out_path).context("Ausgabedatei")?;
                std::io::copy(&mut entry, &mut out)?;
            } else { continue; }
        }
        written.push(out_path.to_string_lossy().into_owned());
    }
    Ok(written)
}

// ── ZIP helpers ───────────────────────────────────────────────────────────────

fn copy_entry<R: Read + Seek>(src: &mut ZipArchive<R>, dst: &mut ZipWriter<File>, name: &str) -> Result<()> {
    let entry = match src.by_name(name) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    // raw_copy_file transfers compressed bytes directly — no decompression overhead.
    dst.raw_copy_file(entry)?;
    Ok(())
}

fn is_image(name: &str) -> bool {
    matches!(
        name.rsplit('.').next().unwrap_or(""),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "avif"
    )
}

// ── XML ───────────────────────────────────────────────────────────────────────

fn parse_comic_info(xml: &str) -> ComicMeta {
    let mut m = ComicMeta::default();
    macro_rules! ex {
        ($f:ident, $t:expr) => { m.$f = extract_tag(xml, $t); };
    }
    // Schema sequence order
    ex!(title,                "Title");
    ex!(series,               "Series");
    ex!(number,               "Number");
    ex!(count,                "Count");
    ex!(volume,               "Volume");
    ex!(alternate_series,     "AlternateSeries");
    ex!(alternate_number,     "AlternateNumber");
    ex!(alternate_count,      "AlternateCount");
    ex!(summary,              "Summary");
    ex!(notes,                "Notes");
    ex!(year,                 "Year");
    ex!(month,                "Month");
    ex!(day,                  "Day");
    ex!(writer,               "Writer");
    ex!(penciller,            "Penciller");
    ex!(inker,                "Inker");
    ex!(colorist,             "Colorist");
    ex!(letterer,             "Letterer");
    ex!(cover_artist,         "CoverArtist");
    ex!(editor,               "Editor");
    ex!(translator,           "Translator");
    ex!(publisher,            "Publisher");
    ex!(imprint,              "Imprint");
    ex!(genre,                "Genre");
    ex!(tags,                 "Tags");
    ex!(web,                  "Web");
    ex!(language_iso,         "LanguageISO");
    ex!(format,               "Format");
    ex!(black_and_white,      "BlackAndWhite");
    ex!(manga,                "Manga");
    ex!(characters,           "Characters");
    ex!(teams,                "Teams");
    ex!(locations,            "Locations");
    ex!(scan_information,     "ScanInformation");
    ex!(story_arc,            "StoryArc");
    ex!(story_arc_number,     "StoryArcNumber");
    ex!(series_group,         "SeriesGroup");
    ex!(age_rating,           "AgeRating");
    ex!(community_rating,     "CommunityRating");
    ex!(main_character_or_team, "MainCharacterOrTeam");
    ex!(review,               "Review");
    m
}

/// Parse `<Pages><Page Image="0" Type="FrontCover" DoublePage="true"/>…</Pages>`
fn parse_pages_section(xml: &str) -> HashMap<usize, (Option<String>, Option<bool>)> {
    let mut map = HashMap::new();
    let start = match xml.find("<Pages>") { Some(i) => i, None => return map };
    let end   = match xml.find("</Pages>") { Some(i) => i, None => return map };
    let section = &xml[start..end];
    let mut pos = 0;
    while let Some(rel) = section[pos..].find("<Page ") {
        let abs = pos + rel;
        let close = section[abs..].find("/>").unwrap_or(section.len() - abs) + abs;
        let tag = &section[abs..close + 2];
        let image_idx: Option<usize> = attr_value(tag, "Image").and_then(|v| v.parse().ok());
        let page_type = attr_value(tag, "Type");
        let double_page = attr_value(tag, "DoublePage").map(|v| v.eq_ignore_ascii_case("true"));
        if let Some(idx) = image_idx {
            map.insert(idx, (page_type, double_page));
        }
        pos = close + 2;
    }
    map
}

fn attr_value(tag: &str, attr: &str) -> Option<String> {
    let needle = format!("{}=\"", attr);
    let start = tag.find(&needle)? + needle.len();
    let end = tag[start..].find('"')? + start;
    let v = tag[start..end].trim().to_owned();
    if v.is_empty() { None } else { Some(v) }
}

fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open  = format!("<{}>",  tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end   = xml[start..].find(&close)? + start;
    let v = xml[start..end].trim().to_owned();
    if v.is_empty() { None } else { Some(v) }
}

/// Builds a ComicInfo.xml string that conforms to the v2.0 schema:
/// - Elements in xs:sequence order
/// - PageCount derived from actual page list
/// - <Pages> block before <CommunityRating>
fn build_comic_info(meta: &ComicMeta, pages: &[PageInfo]) -> String {
    let mut x = String::from(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n\
         <ComicInfo xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" \
         xsi:noNamespaceSchemaLocation=\"https://raw.githubusercontent.com/\
         anansi-project/comicinfo/main/schema/v2.0/ComicInfo.xsd\">\n"
    );

    macro_rules! field {
        ($f:expr, $t:expr) => {
            if let Some(ref v) = $f {
                x.push_str(&format!("  <{}>{}</{}>\n", $t, esc(v), $t));
            }
        };
    }

    // Schema sequence order
    field!(meta.title,                "Title");
    field!(meta.series,               "Series");
    field!(meta.number,               "Number");
    field!(meta.count,                "Count");
    field!(meta.volume,               "Volume");
    field!(meta.alternate_series,     "AlternateSeries");
    field!(meta.alternate_number,     "AlternateNumber");
    field!(meta.alternate_count,      "AlternateCount");
    field!(meta.summary,              "Summary");
    field!(meta.notes,                "Notes");
    field!(meta.year,                 "Year");
    field!(meta.month,                "Month");
    field!(meta.day,                  "Day");
    field!(meta.writer,               "Writer");
    field!(meta.penciller,            "Penciller");
    field!(meta.inker,                "Inker");
    field!(meta.colorist,             "Colorist");
    field!(meta.letterer,             "Letterer");
    field!(meta.cover_artist,         "CoverArtist");
    field!(meta.editor,               "Editor");
    field!(meta.translator,           "Translator");
    field!(meta.publisher,            "Publisher");
    field!(meta.imprint,              "Imprint");
    field!(meta.genre,                "Genre");
    field!(meta.tags,                 "Tags");
    field!(meta.web,                  "Web");
    // PageCount is always derived — never trust user-supplied value
    x.push_str(&format!("  <PageCount>{}</PageCount>\n", pages.len()));
    field!(meta.language_iso,         "LanguageISO");
    field!(meta.format,               "Format");
    field!(meta.black_and_white,      "BlackAndWhite");
    field!(meta.manga,                "Manga");
    field!(meta.characters,           "Characters");
    field!(meta.teams,                "Teams");
    field!(meta.locations,            "Locations");
    field!(meta.scan_information,     "ScanInformation");
    field!(meta.story_arc,            "StoryArc");
    field!(meta.story_arc_number,     "StoryArcNumber");
    field!(meta.series_group,         "SeriesGroup");
    field!(meta.age_rating,           "AgeRating");

    // <Pages> block — only emit if at least one page has metadata
    let has_meta = pages.iter().any(|p| p.page_type.is_some() || p.double_page == Some(true));
    if has_meta {
        x.push_str("  <Pages>\n");
        for (i, page) in pages.iter().enumerate() {
            let mut attrs = format!("Image=\"{}\"", i);
            if let Some(ref t) = page.page_type {
                attrs.push_str(&format!(" Type=\"{}\"", t));
            }
            if page.double_page == Some(true) {
                attrs.push_str(" DoublePage=\"true\"");
            }
            x.push_str(&format!("    <Page {}/>\n", attrs));
        }
        x.push_str("  </Pages>\n");
    }

    field!(meta.community_rating,      "CommunityRating");
    field!(meta.main_character_or_team,"MainCharacterOrTeam");
    field!(meta.review,                "Review");

    x.push_str("</ComicInfo>\n");
    x
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
     .replace('\'', "&apos;")
}
