pub mod commands;
pub mod security;

use tauri::{Manager, Runtime, WindowEvent};

use commands::vault::VaultRegistry;

pub(crate) fn handle_window_event(registry: &VaultRegistry, label: &str, event: &WindowEvent) {
    if matches!(event, WindowEvent::Destroyed) {
        registry.revoke_owner(label);
    }
}

pub fn studio_builder<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .manage(VaultRegistry::default())
        .invoke_handler(tauri::generate_handler![
            commands::backup::backup_save_zip,
            commands::vault::vault_select,
            commands::vault::vault_list,
            commands::vault::vault_read_text,
            commands::vault::vault_read_binary,
            commands::vault::vault_write_text_atomic,
            commands::vault::vault_write_binary_atomic,
            commands::vault::vault_move,
            commands::vault::vault_remove,
            commands::vault::vault_exists,
            commands::vault::vault_watch,
            commands::vault::vault_unwatch,
        ])
        .on_window_event(|window, event| {
            handle_window_event(&window.state::<VaultRegistry>(), window.label(), event);
        })
}

pub fn run() {
    studio_builder(tauri::Builder::default())
        .build(tauri::generate_context!())
        .expect("failed to build The Studio desktop app")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<VaultRegistry>().revoke_all();
            }
        });
}

#[cfg(test)]
mod secure_tests;
