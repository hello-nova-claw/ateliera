use std::{
    fs::{self, OpenOptions},
    io::Write,
    os::unix::fs::OpenOptionsExt,
    path::Path,
};

use tauri::{http::HeaderMap, ipc::InvokeBody};
use uuid::Uuid;

use super::vault::VaultError;

const MAX_BACKUP_BYTES: usize = 512 * 1024 * 1024;
const BACKUP_NAME_HEADER: &str = "x-studio-backup-name";

fn decode_percent_encoded(value: &str) -> Result<String, VaultError> {
    let source = value.as_bytes();
    let mut decoded = Vec::with_capacity(source.len());
    let mut offset = 0;
    while offset < source.len() {
        if source[offset] == b'%' {
            let encoded = source
                .get(offset + 1..offset + 3)
                .ok_or(VaultError::PathEscape)?;
            let encoded = std::str::from_utf8(encoded).map_err(|_| VaultError::PathEscape)?;
            decoded.push(u8::from_str_radix(encoded, 16).map_err(|_| VaultError::PathEscape)?);
            offset += 3;
        } else {
            decoded.push(source[offset]);
            offset += 1;
        }
    }
    String::from_utf8(decoded).map_err(|_| VaultError::PathEscape)
}

fn decode_backup_request<'a>(
    body: &'a InvokeBody,
    headers: &HeaderMap,
) -> Result<(String, &'a [u8]), VaultError> {
    let encoded_name = headers
        .get(BACKUP_NAME_HEADER)
        .ok_or(VaultError::PathEscape)?
        .to_str()
        .map_err(|_| VaultError::PathEscape)?;
    let name = decode_percent_encoded(encoded_name)?;
    validate_backup_name(&name)?;
    let InvokeBody::Raw(bytes) = body else {
        return Err(VaultError::Unavailable);
    };
    if bytes.len() > MAX_BACKUP_BYTES || !bytes.starts_with(b"PK\x03\x04") {
        return Err(VaultError::Unavailable);
    }
    Ok((name, bytes))
}

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
pub fn backup_save_zip(request: tauri::ipc::Request<'_>) -> Result<String, VaultError> {
    let (suggested_file_name, bytes) = decode_backup_request(request.body(), request.headers())?;
    let Some(destination) = rfd::FileDialog::new()
        .set_title("Save Ateliera backup")
        .set_file_name(suggested_file_name)
        .add_filter("ZIP archive", &["zip"])
        .save_file()
    else {
        return Ok("cancelled".to_owned());
    };
    write_backup_atomically(&destination, bytes)?;
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

#[cfg(test)]
pub(crate) fn decode_backup_request_for_test<'a>(
    body: &'a InvokeBody,
    headers: &HeaderMap,
) -> Result<(String, &'a [u8]), VaultError> {
    decode_backup_request(body, headers)
}
