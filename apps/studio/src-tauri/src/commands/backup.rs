use std::{
    fs::{self, OpenOptions},
    io::Write,
    os::unix::fs::OpenOptionsExt,
    path::Path,
};

use uuid::Uuid;

use super::vault::VaultError;

const MAX_BACKUP_BYTES: usize = 512 * 1024 * 1024;

fn validate_backup_name(name: &str) -> Result<(), VaultError> {
    if name.is_empty()
        || name.len() > 160
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || name.chars().any(char::is_control)
        || !name.to_ascii_lowercase().ends_with(".zip")
    {
        return Err(VaultError::PathEscape);
    }
    Ok(())
}

fn write_backup_atomically(destination: &Path, bytes: &[u8]) -> Result<(), VaultError> {
    if bytes.len() > MAX_BACKUP_BYTES
        || !bytes.starts_with(b"PK\x03\x04")
        || destination
            .extension()
            .and_then(|extension| extension.to_str())
            .is_none_or(|extension| !extension.eq_ignore_ascii_case("zip"))
    {
        return Err(VaultError::PathEscape);
    }
    let parent = destination.parent().ok_or(VaultError::PathEscape)?;
    let temporary = parent.join(format!(".studio-backup-{}.tmp", Uuid::new_v4().simple()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)
            .map_err(|_| VaultError::Unavailable)?;
        file.write_all(bytes)
            .and_then(|_| file.flush())
            .and_then(|_| file.sync_all())
            .map_err(|_| VaultError::Unavailable)?;
        drop(file);
        fs::rename(&temporary, destination).map_err(|_| VaultError::Unavailable)?;
        fs::File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| VaultError::Unavailable)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[tauri::command]
pub fn backup_save_zip(suggested_file_name: String, bytes: Vec<u8>) -> Result<String, VaultError> {
    validate_backup_name(&suggested_file_name)?;
    if bytes.len() > MAX_BACKUP_BYTES || !bytes.starts_with(b"PK\x03\x04") {
        return Err(VaultError::Unavailable);
    }
    let Some(destination) = rfd::FileDialog::new()
        .set_title("Save The Studio backup")
        .set_file_name(suggested_file_name)
        .add_filter("ZIP archive", &["zip"])
        .save_file()
    else {
        return Ok("cancelled".to_owned());
    };
    write_backup_atomically(&destination, &bytes)?;
    Ok("saved".to_owned())
}

#[cfg(test)]
pub(crate) fn validate_backup_name_for_test(name: &str) -> Result<(), VaultError> {
    validate_backup_name(name)
}

#[cfg(test)]
pub(crate) fn write_backup_atomically_for_test(
    destination: &Path,
    bytes: &[u8],
) -> Result<(), VaultError> {
    write_backup_atomically(destination, bytes)
}
