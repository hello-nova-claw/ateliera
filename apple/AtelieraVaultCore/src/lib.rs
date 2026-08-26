//! Portable Ateliera vault read core, exposed to Swift via UniFFI.
//!
//! The read semantics are ported verbatim from
//! `apps/studio/src-tauri/src/commands/vault.rs` (path-guard, symlink-nofollow,
//! streaming SHA-256, sorted listing, `.studio-revision`). The dangerous write
//! path stays in the Tauri crate for now; ADR-012 records the plan to consolidate.

use std::io::Read;
use std::path::{Component, Path};
use std::sync::Arc;

use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::ambient_authority;
use cap_std::fs::{Dir, OpenOptions, OpenOptionsExt};
use sha2::{Digest, Sha256};

uniffi::setup_scaffolding!();

const HASH_BUFFER_BYTES: usize = 65536;
const REVISION_PATH: &str = ".studio-revision";

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum VaultError {
    #[error("the vault is unavailable")]
    Unavailable,
    #[error("that path escapes the vault")]
    PathEscape,
}

#[derive(uniffi::Record)]
pub struct VaultEntry {
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub content_hash: Option<String>,
}

#[derive(uniffi::Record)]
pub struct ReadText {
    pub text: String,
    pub hash: String,
}

/// A capability-scoped handle to a Studio vault folder. Opening is the only
/// ambient-authority boundary; later reads never reopen the path.
#[derive(uniffi::Object)]
pub struct Vault {
    root: Dir,
}

#[uniffi::export]
impl Vault {
    /// Open a vault folder by absolute path. On iOS the caller must already hold
    /// security-scoped access to `path` (see the native picker).
    #[uniffi::constructor]
    pub fn open(path: String) -> Result<Arc<Self>, VaultError> {
        let root = Dir::open_ambient_dir(&path, ambient_authority())
            .map_err(|_| VaultError::Unavailable)?;
        Ok(Arc::new(Vault { root }))
    }

    /// List entries under `prefix` (or the whole vault), sorted by path, files
    /// carrying size + content hash. Internal `.studio-*` entries are hidden.
    pub fn list(&self, prefix: Option<String>) -> Result<Vec<VaultEntry>, VaultError> {
        let mut entries = Vec::new();
        match prefix.as_deref() {
            None | Some("") => collect_entries(&self.root, "", &mut entries)?,
            Some(prefix) => {
                validate_relative(prefix)?;
                let parent = open_parent(&self.root, prefix)?;
                let metadata = parent
                    .directory
                    .symlink_metadata(&parent.basename)
                    .map_err(map_path_error)?;
                if metadata.file_type().is_symlink() {
                    return Err(VaultError::PathEscape);
                }
                if metadata.is_dir() {
                    let dir = parent
                        .directory
                        .open_dir_nofollow(&parent.basename)
                        .map_err(map_path_error)?;
                    collect_entries(&dir, prefix, &mut entries)?;
                } else {
                    push_file_entry(&parent.directory, &parent.basename, prefix, &mut entries)?;
                }
            }
        }
        entries.sort_by(|left, right| left.path.cmp(&right.path));
        Ok(entries)
    }

    /// Read a UTF-8 note and its SHA-256, refusing symlinks and traversal.
    pub fn read_text(&self, path: String) -> Result<ReadText, VaultError> {
        let parent = open_parent(&self.root, &path)?;
        let bytes = read_file_nofollow(&parent.directory, &parent.basename)?;
        let text = String::from_utf8(bytes.clone()).map_err(|_| VaultError::Unavailable)?;
        Ok(ReadText {
            text,
            hash: hash(&bytes),
        })
    }

    /// Whether a path exists (false, not an error, for missing parents).
    pub fn exists(&self, path: String) -> Result<bool, VaultError> {
        let parent = match open_parent(&self.root, &path) {
            Ok(parent) => parent,
            Err(VaultError::Unavailable) => return Ok(false),
            Err(other) => return Err(other),
        };
        match parent.directory.symlink_metadata(&parent.basename) {
            Ok(metadata) if metadata.file_type().is_symlink() => Err(VaultError::PathEscape),
            Ok(_) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(map_path_error(error)),
        }
    }

    /// The monotonic vault revision as a decimal string (`"0"` when absent). This
    /// core is read-only and never writes the revision — the writer owns it.
    pub fn get_revision(&self) -> Result<String, VaultError> {
        match self.root.symlink_metadata(REVISION_PATH) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                let bytes = read_file_nofollow(&self.root, REVISION_PATH)?;
                let value = std::str::from_utf8(&bytes)
                    .map_err(|_| VaultError::Unavailable)?
                    .trim();
                if value.is_empty()
                    || (value.len() > 1 && value.starts_with('0'))
                    || !value.bytes().all(|byte| byte.is_ascii_digit())
                {
                    return Err(VaultError::Unavailable);
                }
                Ok(value.to_owned())
            }
            Ok(_) => Err(VaultError::Unavailable),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok("0".to_owned()),
            Err(error) => Err(map_path_error(error)),
        }
    }
}

struct ParentHandle {
    directory: Dir,
    basename: String,
}

fn is_internal_component(part: &str) -> bool {
    part.as_bytes()
        .get(..b".studio-".len())
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(b".studio-"))
}

fn validate_relative(relative: &str) -> Result<(), VaultError> {
    if relative.is_empty()
        || relative == "."
        || relative.contains('\0')
        || relative.contains('\\')
        || relative.starts_with('/')
        || relative.ends_with('/')
        || relative.as_bytes().get(1) == Some(&b':')
        || relative
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == ".." || is_internal_component(part))
        || Path::new(relative)
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(VaultError::PathEscape);
    }
    Ok(())
}

fn open_parent(root: &Dir, relative: &str) -> Result<ParentHandle, VaultError> {
    validate_relative(relative)?;
    let mut parts = relative.split('/').peekable();
    let mut current = root.try_clone().map_err(|_| VaultError::Unavailable)?;
    let mut basename = None;
    while let Some(part) = parts.next() {
        if parts.peek().is_none() {
            basename = Some(part.to_owned());
            break;
        }
        current = current.open_dir_nofollow(part).map_err(map_path_error)?;
    }
    Ok(ParentHandle {
        directory: current,
        basename: basename.ok_or(VaultError::PathEscape)?,
    })
}

fn open_file_nofollow(directory: &Dir, basename: &str) -> Result<cap_std::fs::File, VaultError> {
    let mut options = OpenOptions::new();
    options
        .read(true)
        .custom_flags(libc::O_NONBLOCK)
        .follow(FollowSymlinks::No);
    let file = directory.open_with(basename, &options).map_err(map_path_error)?;
    if !file.metadata().map_err(|_| VaultError::Unavailable)?.is_file() {
        return Err(VaultError::Unavailable);
    }
    Ok(file)
}

fn read_file_nofollow(directory: &Dir, basename: &str) -> Result<Vec<u8>, VaultError> {
    let mut bytes = Vec::new();
    open_file_nofollow(directory, basename)?
        .read_to_end(&mut bytes)
        .map_err(|_| VaultError::Unavailable)?;
    Ok(bytes)
}

fn hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn stream_file_hash(file: &mut impl Read) -> Result<(u64, String), VaultError> {
    let mut digest = Sha256::new();
    let mut total = 0u64;
    let mut buffer = [0u8; HASH_BUFFER_BYTES];
    loop {
        let read = file.read(&mut buffer).map_err(|_| VaultError::Unavailable)?;
        if read == 0 {
            break;
        }
        total = total
            .checked_add(read as u64)
            .ok_or(VaultError::Unavailable)?;
        digest.update(&buffer[..read]);
    }
    Ok((total, hex::encode(digest.finalize())))
}

fn collect_entries(directory: &Dir, prefix: &str, entries: &mut Vec<VaultEntry>) -> Result<(), VaultError> {
    for entry in directory.entries().map_err(|_| VaultError::Unavailable)? {
        let entry = entry.map_err(|_| VaultError::Unavailable)?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| VaultError::Unavailable)?;
        if is_internal_component(&name) {
            continue;
        }
        let path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let metadata = directory.symlink_metadata(&name).map_err(map_path_error)?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            entries.push(VaultEntry {
                path: path.clone(),
                is_directory: true,
                size: None,
                content_hash: None,
            });
            let child = directory.open_dir_nofollow(&name).map_err(map_path_error)?;
            collect_entries(&child, &path, entries)?;
        } else if metadata.is_file() {
            push_file_entry(directory, &name, &path, entries)?;
        }
    }
    Ok(())
}

fn push_file_entry(
    directory: &Dir,
    basename: &str,
    path: &str,
    entries: &mut Vec<VaultEntry>,
) -> Result<(), VaultError> {
    let mut file = open_file_nofollow(directory, basename)?;
    let stat_size = file.metadata().map_err(|_| VaultError::Unavailable)?.len();
    let (size, content_hash) = stream_file_hash(&mut file)?;
    if size != stat_size {
        return Err(VaultError::Unavailable);
    }
    entries.push(VaultEntry {
        path: path.to_owned(),
        is_directory: false,
        size: Some(size),
        content_hash: Some(content_hash),
    });
    Ok(())
}

fn map_path_error(error: std::io::Error) -> VaultError {
    match error.raw_os_error() {
        Some(code) if code == libc::ELOOP || code == libc::ENOTDIR => VaultError::PathEscape,
        _ => VaultError::Unavailable,
    }
}
