use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Seek, Write};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComicMeta {
    pub title: Option<String>,
    pub series: Option<String>,
    pub number: Option<String>,
    pub volume: Option<String>,
    pub year: Option<String>,
    pub month: Option<String>,
    pub writer: Option<String>,
    pub penciller: Option<String>,
    pub inker: Option<String>,
    pub colorist: Option<String>,
    pub letterer: Option<String>,
    pub cover_artist: Option<String>,
    pub editor: Option<String>,
    pub publisher: Option<String>,
    pub imprint: Option<String>,
    pub genre: Option<String>,
    pub web: Option<String>,
    pub page_count: Option<String>,
    pub language_iso: Option<String>,
    pub format: Option<String>,
    pub black_and_white: Option<String>,
    pub manga: Option<String>,
    pub characters: Option<String>,
    pub teams: Option<String>,
    pub locations: Option<String>,
    pub story_arc: Option<String>,
    pub series_group: Option<String>,
    pub age_rating: Option<String>,
    pub summary: Option<String>,
    pub notes: Option<String>,
    pub scan_information: Option<String>,
    pub community_rating: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LoadResult {
    pub meta: ComicMeta,
    pub pages: Vec<String>,
}

/// Reads only ComicInfo.xml + lists image entries — never extracts images.
pub fn load_cbz(path: &str) -> Result<LoadResult> {
    let file = File::open(path).context("Datei öffnen")?;
    let mut archive = ZipArchive::new(file).context("ZIP öffnen")?;

    let mut meta = ComicMeta::default();
    let mut pages: Vec<String> = Vec::new();

    // Collect all names first to avoid borrow issues
    let names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|e| e.name().to_owned()))
        .collect();

    for name in &names {
        let lower = name.to_lowercase();
        if is_image(&lower) {
            // Skip path prefix if any (flat or subdir)
            let basename = name.rsplit('/').next().unwrap_or(name).to_owned();
            pages.push(basename);
        }
    }
    pages.sort();

    // Read ComicInfo.xml if present
    let comic_info_name = names
        .iter()
        .find(|n| n.to_lowercase() == "comicinfo.xml")
        .cloned();

    if let Some(ref xml_name) = comic_info_name {
        let mut entry = archive.by_name(xml_name).context("ComicInfo.xml lesen")?;
        let mut xml = String::new();
        entry.read_to_string(&mut xml)?;
        meta = parse_comic_info(&xml);
    }

    Ok(LoadResult { meta, pages })
}

/// Rewrites the CBZ in-place: updates ComicInfo.xml and reorders pages.
/// Images are streamed through without full decompression.
pub fn save_cbz(path: &str, meta: &ComicMeta, page_order: &[String]) -> Result<()> {
    let tmp_path = format!("{}.cbztag.tmp", path);

    {
        let src_file = File::open(path).context("Quelldatei öffnen")?;
        let mut src = ZipArchive::new(src_file).context("Quell-ZIP öffnen")?;

        let dst_file = File::create(&tmp_path).context("Temp-Datei erstellen")?;
        let mut dst = ZipWriter::new(dst_file);

        // Build lookup: basename → full entry name in source archive
        let name_map: HashMap<String, String> = (0..src.len())
            .filter_map(|i| {
                let entry = src.by_index(i).ok()?;
                let name = entry.name().to_owned();
                let lower = name.to_lowercase();
                if is_image(&lower) {
                    let basename = name.rsplit('/').next().unwrap_or(&name).to_owned();
                    Some((basename, name))
                } else {
                    None
                }
            })
            .collect();

        // Write pages in requested order
        for basename in page_order {
            let src_name = name_map.get(basename).map(|s| s.as_str()).unwrap_or(basename);
            copy_entry(&mut src, &mut dst, src_name)?;
        }

        // Copy any non-image, non-ComicInfo entries (e.g. credits.txt)
        let all_names: Vec<String> = (0..src.len())
            .filter_map(|i| src.by_index(i).ok().map(|e| e.name().to_owned()))
            .collect();
        for name in &all_names {
            let lower = name.to_lowercase();
            if !is_image(&lower) && lower != "comicinfo.xml" {
                copy_entry(&mut src, &mut dst, name)?;
            }
        }

        // Write updated ComicInfo.xml
        let xml = build_comic_info(meta);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        dst.start_file("ComicInfo.xml", opts)?;
        dst.write_all(xml.as_bytes())?;

        dst.finish()?;
    }

    fs::rename(&tmp_path, path).context("Atomisches Ersetzen")?;
    Ok(())
}

fn copy_entry<R: Read + Seek>(
    src: &mut ZipArchive<R>,
    dst: &mut ZipWriter<File>,
    name: &str,
) -> Result<()> {
    let mut entry = match src.by_name(name) {
        Ok(e) => e,
        Err(_) => return Ok(()), // Entry fehlt — skip
    };
    let opts = SimpleFileOptions::default()
        .compression_method(entry.compression())
        .last_modified_time(entry.last_modified().unwrap_or_default());
    dst.start_file(entry.name().to_owned(), opts)?;
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf)?;
    dst.write_all(&buf)?;
    Ok(())
}

fn is_image(name: &str) -> bool {
    name.ends_with(".jpg")
        || name.ends_with(".jpeg")
        || name.ends_with(".png")
        || name.ends_with(".gif")
        || name.ends_with(".webp")
        || name.ends_with(".avif")
}

// ── XML parsing ───────────────────────────────────────────────────────────────

fn parse_comic_info(xml: &str) -> ComicMeta {
    let mut meta = ComicMeta::default();
    // Simple tag extraction — avoids pulling in a full XML DOM
    macro_rules! extract {
        ($field:ident, $tag:expr) => {
            meta.$field = extract_tag(xml, $tag);
        };
    }
    extract!(title, "Title");
    extract!(series, "Series");
    extract!(number, "Number");
    extract!(volume, "Volume");
    extract!(year, "Year");
    extract!(month, "Month");
    extract!(writer, "Writer");
    extract!(penciller, "Penciller");
    extract!(inker, "Inker");
    extract!(colorist, "Colorist");
    extract!(letterer, "Letterer");
    extract!(cover_artist, "CoverArtist");
    extract!(editor, "Editor");
    extract!(publisher, "Publisher");
    extract!(imprint, "Imprint");
    extract!(genre, "Genre");
    extract!(web, "Web");
    extract!(page_count, "PageCount");
    extract!(language_iso, "LanguageISO");
    extract!(format, "Format");
    extract!(black_and_white, "BlackAndWhite");
    extract!(manga, "Manga");
    extract!(characters, "Characters");
    extract!(teams, "Teams");
    extract!(locations, "Locations");
    extract!(story_arc, "StoryArc");
    extract!(series_group, "SeriesGroup");
    extract!(age_rating, "AgeRating");
    extract!(summary, "Summary");
    extract!(notes, "Notes");
    extract!(scan_information, "ScanInformation");
    extract!(community_rating, "CommunityRating");
    meta
}

fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let value = xml[start..end].trim().to_owned();
    if value.is_empty() { None } else { Some(value) }
}

fn build_comic_info(meta: &ComicMeta) -> String {
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<ComicInfo>\n");

    macro_rules! field {
        ($field:expr, $tag:expr) => {
            if let Some(ref v) = $field {
                xml.push_str(&format!("  <{}>{}</{}>\n", $tag, escape_xml(v), $tag));
            }
        };
    }
    field!(meta.title, "Title");
    field!(meta.series, "Series");
    field!(meta.number, "Number");
    field!(meta.volume, "Volume");
    field!(meta.year, "Year");
    field!(meta.month, "Month");
    field!(meta.writer, "Writer");
    field!(meta.penciller, "Penciller");
    field!(meta.inker, "Inker");
    field!(meta.colorist, "Colorist");
    field!(meta.letterer, "Letterer");
    field!(meta.cover_artist, "CoverArtist");
    field!(meta.editor, "Editor");
    field!(meta.publisher, "Publisher");
    field!(meta.imprint, "Imprint");
    field!(meta.genre, "Genre");
    field!(meta.web, "Web");
    field!(meta.page_count, "PageCount");
    field!(meta.language_iso, "LanguageISO");
    field!(meta.format, "Format");
    field!(meta.black_and_white, "BlackAndWhite");
    field!(meta.manga, "Manga");
    field!(meta.characters, "Characters");
    field!(meta.teams, "Teams");
    field!(meta.locations, "Locations");
    field!(meta.story_arc, "StoryArc");
    field!(meta.series_group, "SeriesGroup");
    field!(meta.age_rating, "AgeRating");
    field!(meta.summary, "Summary");
    field!(meta.notes, "Notes");
    field!(meta.scan_information, "ScanInformation");
    field!(meta.community_rating, "CommunityRating");

    xml.push_str("</ComicInfo>\n");
    xml
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
     .replace('\'', "&apos;")
}
