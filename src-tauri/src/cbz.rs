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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub filename: String,
    pub index: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub double_page: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct LoadResult {
    pub meta: ComicMeta,
    pub pages: Vec<PageInfo>,
}

/// Reads only ComicInfo.xml + lists image entries — never extracts images.
pub fn load_cbz(path: &str) -> Result<LoadResult> {
    let file = File::open(path).context("Datei öffnen")?;
    let mut archive = ZipArchive::new(file).context("ZIP öffnen")?;

    let mut meta = ComicMeta::default();

    let names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|e| e.name().to_owned()))
        .collect();

    let mut image_names: Vec<String> = names
        .iter()
        .filter(|n| is_image(&n.to_lowercase()))
        .map(|n| n.rsplit('/').next().unwrap_or(n).to_owned())
        .collect();
    image_names.sort();

    let comic_info_name = names
        .iter()
        .find(|n| n.to_lowercase() == "comicinfo.xml")
        .cloned();

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
            PageInfo { filename, index: i, page_type, double_page }
        })
        .collect();

    Ok(LoadResult { meta, pages })
}

/// Rewrites the CBZ in-place: updates ComicInfo.xml, reorders pages, drops removed ones.
pub fn save_cbz(path: &str, meta: &ComicMeta, pages: &[PageInfo]) -> Result<()> {
    let tmp_path = format!("{}.cbztag.tmp", path);

    {
        let src_file = File::open(path).context("Quelldatei öffnen")?;
        let mut src = ZipArchive::new(src_file).context("Quell-ZIP öffnen")?;

        let dst_file = File::create(&tmp_path).context("Temp-Datei erstellen")?;
        let mut dst = ZipWriter::new(dst_file);

        // basename → full entry name in source
        let name_map: HashMap<String, String> = (0..src.len())
            .filter_map(|i| {
                let entry = src.by_index(i).ok()?;
                let name = entry.name().to_owned();
                if is_image(&name.to_lowercase()) {
                    let basename = name.rsplit('/').next().unwrap_or(&name).to_owned();
                    Some((basename, name))
                } else {
                    None
                }
            })
            .collect();

        for page in pages {
            let src_name = name_map
                .get(&page.filename)
                .map(|s| s.as_str())
                .unwrap_or(&page.filename);
            copy_entry(&mut src, &mut dst, src_name)?;
        }

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

/// Appends new image files to an existing CBZ and returns their PageInfo.
pub fn add_pages(path: &str, image_paths: &[String]) -> Result<Vec<PageInfo>> {
    let tmp_path = format!("{}.cbztag.tmp", path);
    let mut added: Vec<PageInfo> = Vec::new();

    {
        let src_file = File::open(path).context("Quelldatei öffnen")?;
        let mut src = ZipArchive::new(src_file).context("Quell-ZIP öffnen")?;

        // Collect existing entry names to detect conflicts
        let existing_names: std::collections::HashSet<String> = (0..src.len())
            .filter_map(|i| src.by_index(i).ok().map(|e| e.name().to_owned()))
            .collect();

        let dst_file = File::create(&tmp_path).context("Temp-Datei erstellen")?;
        let mut dst = ZipWriter::new(dst_file);

        // Copy all existing entries verbatim
        for i in 0..src.len() {
            let name = src.by_index(i)?.name().to_owned();
            copy_entry(&mut src, &mut dst, &name)?;
        }

        // Append new images
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for img_path in image_paths {
            let basename = std::path::Path::new(img_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(img_path)
                .to_owned();

            // Resolve name collision by prefixing
            let entry_name = if existing_names.contains(&basename) {
                format!("added_{}", basename)
            } else {
                basename.clone()
            };

            let mut data = Vec::new();
            File::open(img_path)?.read_to_end(&mut data)?;
            dst.start_file(&entry_name, opts)?;
            dst.write_all(&data)?;

            added.push(PageInfo {
                filename: entry_name,
                index: 0, // caller re-indexes
                page_type: None,
                double_page: None,
            });
        }

        dst.finish()?;
    }

    fs::rename(&tmp_path, path).context("Atomisches Ersetzen")?;
    Ok(added)
}

fn copy_entry<R: Read + Seek>(
    src: &mut ZipArchive<R>,
    dst: &mut ZipWriter<File>,
    name: &str,
) -> Result<()> {
    let mut entry = match src.by_name(name) {
        Ok(e) => e,
        Err(_) => return Ok(()),
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

// ── XML ──────────────────────────────────────────────────────────────────────

fn parse_comic_info(xml: &str) -> ComicMeta {
    let mut meta = ComicMeta::default();
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

/// Parse `<Pages><Page Image="0" Type="FrontCover" DoublePage="true"/>…</Pages>`
fn parse_pages_section(xml: &str) -> HashMap<usize, (Option<String>, Option<bool>)> {
    let mut map = HashMap::new();
    let pages_start = match xml.find("<Pages>") {
        Some(i) => i,
        None => return map,
    };
    let pages_end = match xml.find("</Pages>") {
        Some(i) => i,
        None => return map,
    };
    let section = &xml[pages_start..pages_end];

    // Find each <Page ... /> element
    let mut pos = 0;
    while let Some(start) = section[pos..].find("<Page ") {
        let abs = pos + start;
        let end = section[abs..].find("/>").unwrap_or(section.len() - abs) + abs;
        let tag = &section[abs..end + 2];

        let image_idx: Option<usize> = attr_value(tag, "Image")
            .and_then(|v| v.parse().ok());
        let page_type = attr_value(tag, "Type");
        let double_page = attr_value(tag, "DoublePage")
            .map(|v| v.eq_ignore_ascii_case("true"));

        if let Some(idx) = image_idx {
            map.insert(idx, (page_type, double_page));
        }
        pos = end + 2;
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
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let value = xml[start..end].trim().to_owned();
    if value.is_empty() { None } else { Some(value) }
}

fn build_comic_info(meta: &ComicMeta, pages: &[PageInfo]) -> String {
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<ComicInfo>\n");

    macro_rules! field {
        ($f:expr, $tag:expr) => {
            if let Some(ref v) = $f {
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
    // PageCount derived from actual page list
    xml.push_str(&format!("  <PageCount>{}</PageCount>\n", pages.len()));
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

    // Write <Pages> block only if any page has metadata
    let has_page_meta = pages.iter().any(|p| p.page_type.is_some() || p.double_page == Some(true));
    if has_page_meta {
        xml.push_str("  <Pages>\n");
        for (i, page) in pages.iter().enumerate() {
            let mut attrs = format!("Image=\"{}\"", i);
            if let Some(ref t) = page.page_type {
                attrs.push_str(&format!(" Type=\"{}\"", t));
            }
            if page.double_page == Some(true) {
                attrs.push_str(" DoublePage=\"true\"");
            }
            xml.push_str(&format!("    <Page {}/>\n", attrs));
        }
        xml.push_str("  </Pages>\n");
    }

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
