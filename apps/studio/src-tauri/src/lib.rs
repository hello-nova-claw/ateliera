pub mod commands;
pub mod security;

pub fn with_vault_commands(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.invoke_handler(tauri::generate_handler![
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
}
