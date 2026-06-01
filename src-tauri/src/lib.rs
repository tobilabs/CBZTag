mod cbz;

use cbz::{ComicMeta, LoadResult};

#[tauri::command]
fn load_cbz(path: String) -> Result<LoadResult, String> {
    cbz::load_cbz(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_cbz(path: String, meta: ComicMeta, page_order: Vec<String>) -> Result<(), String> {
    cbz::save_cbz(&path, &meta, &page_order).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![load_cbz, save_cbz])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
