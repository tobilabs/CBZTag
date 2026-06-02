mod cbz;

use cbz::{ComicMeta, LoadResult, PageInfo};

#[tauri::command]
fn load_cbz(path: String) -> Result<LoadResult, String> {
    cbz::load_cbz(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_cbz(path: String, meta: ComicMeta, pages: Vec<PageInfo>) -> Result<(), String> {
    cbz::save_cbz(&path, &meta, &pages).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_page_thumbnail(path: String, filename: String, source_path: Option<String>) -> Result<String, String> {
    cbz::get_page_thumbnail(&path, &filename, source_path.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn extract_pages(path: String, pages: Vec<cbz::PageInfo>, dest_dir: String) -> Result<Vec<String>, String> {
    cbz::extract_pages(&path, &pages, &dest_dir).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![load_cbz, save_cbz, get_page_thumbnail, extract_pages])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
