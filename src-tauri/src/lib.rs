mod python_bridge;

use python_bridge::PythonBridge;
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{Manager, Window};

struct AppState {
    py: Mutex<Option<PythonBridge>>,
}

// ── Books ──

#[tauri::command]
fn list_books(state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("list_books", json!({}))
}

#[tauri::command]
fn create_book(name: String, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("create_book", json!({ "name": name }))
}

#[tauri::command]
fn delete_book(name: String, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("delete_book", json!({ "name": name }))
}

#[tauri::command]
fn rename_book(old_name: String, new_name: String, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("rename_book", json!({ "old_name": old_name, "new_name": new_name }))
}

#[tauri::command]
fn get_book_meta(book_name: String, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("get_book_meta", json!({ "book_name": book_name }))
}

// ── Groups ──

#[tauri::command]
fn create_group(book_name: String, name: String, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("create_group", json!({ "book_name": book_name, "name": name }))
}

#[tauri::command]
fn rename_group(book_name: String, old_name: String, new_name: String, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("rename_group", json!({ "book_name": book_name, "old_name": old_name, "new_name": new_name }))
}

#[tauri::command]
fn delete_group(book_name: String, group_name: String, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("delete_group", json!({ "book_name": book_name, "group_name": group_name }))
}

#[tauri::command]
fn toggle_group(book_name: String, group_name: String, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("toggle_group", json!({ "book_name": book_name, "group_name": group_name }))
}

// ── Chapters ──

#[tauri::command]
fn create_chapter(book_name: String, name: String, group_id: Option<String>, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("create_chapter", json!({ "book_name": book_name, "name": name, "group_id": group_id }))
}

#[tauri::command]
fn rename_chapter(book_name: String, old_name: String, new_name: String, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("rename_chapter", json!({ "book_name": book_name, "old_name": old_name, "new_name": new_name }))
}

#[tauri::command]
fn delete_chapter(book_name: String, chapter_name: String, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("delete_chapter", json!({ "book_name": book_name, "chapter_name": chapter_name }))
}

#[tauri::command]
fn move_chapter(book_name: String, chapter_name: String, target_group_id: Option<String>, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("move_chapter", json!({ "book_name": book_name, "chapter_name": chapter_name, "target_group_id": target_group_id }))
}

// ── Documents ──

#[tauri::command]
fn get_document(book_name: String, chapter_name: String, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("get_document", json!({ "book_name": book_name, "chapter_name": chapter_name }))
}

#[tauri::command]
fn save_document(book_name: String, chapter_name: String, content: Value, state: tauri::State<AppState>) -> Result<Value, String> {
    let guard = state.py.lock().map_err(|e| format!("Lock: {e}"))?;
    guard.as_ref().ok_or("Python not started")?.call("save_document", json!({ "book_name": book_name, "chapter_name": chapter_name, "content": content }))
}

// ── Window controls (native Tauri) ──

#[tauri::command]
fn minimize_window(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| format!("{e}"))
}

#[tauri::command]
fn maximize_window(window: Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| format!("{e}"))
    } else {
        window.maximize().map_err(|e| format!("{e}"))
    }
}

#[tauri::command]
fn close_window(window: Window) -> Result<(), String> {
    window.close().map_err(|e| format!("{e}"))
}

// ── Window state persistence ──

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

struct WindowStatePath(PathBuf);

fn load_window_state(data_dir: &str) -> Option<WindowState> {
    let path = PathBuf::from(data_dir).join("window_state.json");
    if path.exists() {
        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(state) = serde_json::from_str::<WindowState>(&data) {
                return Some(state);
            }
        }
    }
    None
}

fn save_window_state(data_dir: &str, state: &WindowState) {
    let path = PathBuf::from(data_dir).join("window_state.json");
    if let Ok(json) = serde_json::to_string(state) {
        let _ = fs::write(path, json);
    }
}

// ── Entry ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("data dir: {e}"))?
                .to_string_lossy()
                .to_string();

            let py = PythonBridge::start(&data_dir).map_err(|e| {
                log::error!("Python backend failed: {e}");
                e
            })?;

            app.manage(AppState {
                py: Mutex::new(Some(py)),
            });

            // Restore window state
            if let Some(win) = app.get_webview_window("main") {
                if let Some(saved) = load_window_state(&data_dir) {
                    let _ = win.set_position(tauri::PhysicalPosition::new(saved.x, saved.y));
                    let _ = win.set_size(tauri::PhysicalSize::new(saved.width, saved.height));
                    if saved.maximized {
                        let _ = win.maximize();
                    }
                }
            }

            // Store data_dir for window event handler
            app.manage(WindowStatePath(PathBuf::from(data_dir)));

            log::info!("Soul Writer started");
            Ok(())
        })
        .on_window_event(|window, event| {
            let data_dir_state = window.state::<WindowStatePath>();
            let data_dir = data_dir_state.0.to_string_lossy().to_string();

            match event {
                tauri::WindowEvent::Destroyed => {
                    let state = window.state::<AppState>();
                    let mut guard = state.py.lock().unwrap();
                    if let Some(py) = guard.take() {
                        drop(py);
                    }
                }
                tauri::WindowEvent::CloseRequested { .. } => {
                    // Save window state on close
                    if let Ok(pos) = window.outer_position() {
                        if let Ok(size) = window.outer_size() {
                            let maximized = window.is_maximized().unwrap_or(false);
                            save_window_state(&data_dir, &WindowState {
                                x: pos.x,
                                y: pos.y,
                                width: size.width,
                                height: size.height,
                                maximized,
                            });
                        }
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_books,
            create_book,
            delete_book,
            rename_book,
            get_book_meta,
            create_group,
            rename_group,
            delete_group,
            toggle_group,
            create_chapter,
            rename_chapter,
            delete_chapter,
            move_chapter,
            get_document,
            save_document,
            minimize_window,
            maximize_window,
            close_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
