#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;
use std::fs::File;
use std::io::Write;

// Native command to save large received binary buffers directly to disk with zero UI memory overhead
#[tauri::command]
async fn save_file_direct(path: String, data: Vec<u8>) -> Result<String, String> {
    match File::create(&path) {
        Ok(mut file) => match file.write_all(&data) {
            Ok(_) => Ok(format!("File saved successfully to {}", path)),
            Err(e) => Err(format!("Failed to write data: {}", e)),
        },
        Err(e) => Err(format!("Failed to create file: {}", e)),
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let _window = app.get_window("main").unwrap();
            #[cfg(debug_assertions)]
            {
                // Open devtools in debug builds
                _window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![save_file_direct])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
