use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

use notify::{
    EventKind, RecommendedWatcher, RecursiveMode, Watcher,
    event::{ModifyKind, RenameMode},
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::Emitter;
use uuid::Uuid;

use crate::security::path_guard::resolve_inside;

static WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static WATCHERS: OnceLock<Mutex<HashMap<String, RecommendedWatcher>>> = OnceLock::new();

#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    #[error("path_escape")]
    PathEscape,
    #[error("conflict")]
    Conflict,
    #[error("unavailable")]
    Unavailable,
}

impl Serialize for VaultError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashResult {
    pub hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadTextResult {
    pub text: String,
    pub hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub path: String,
    pub kind: &'static str,
    pub size: Option<u64>,
    pub modified_at: Option<String>,
    pub content_hash: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum WatchEvent {
    Created {
        path: String,
        hash: String,
    },
    Modified {
        path: String,
        hash: String,
    },
    Removed {
        path: String,
    },
    Moved {
        path: String,
        previous_path: String,
        hash: String,
    },
}

#[derive(Serialize)]
pub struct WatchRegistration {
    pub id: String,
    pub event: String,
}

fn hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn root(token: &str) -> Result<PathBuf, VaultError> {
    Path::new(token)
        .canonicalize()
        .map_err(|_| VaultError::Unavailable)
}

fn read_bytes(path: &Path) -> Result<Vec<u8>, VaultError> {
    let mut bytes = Vec::new();
    File::open(path)
        .and_then(|mut file| file.read_to_end(&mut bytes))
        .map_err(|_| VaultError::Unavailable)?;
    Ok(bytes)
}

pub fn atomic_write(
    root: &Path,
    relative: &str,
    bytes: &[u8],
    expected_hash: Option<&str>,
) -> Result<String, VaultError> {
    let _guard = WRITE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| VaultError::Unavailable)?;
    let destination = resolve_inside(root, relative)?;
    if let Some(expected) = expected_hash {
        let current = read_bytes(&destination).map(|value| hash(&value)).ok();
        if current.as_deref() != Some(expected) {
            return Err(VaultError::Conflict);
        }
    }
    let parent = destination.parent().ok_or(VaultError::PathEscape)?;
    fs::create_dir_all(parent).map_err(|_| VaultError::Unavailable)?;
    // Re-resolve after directory creation to detect a concurrently introduced symlink.
    let destination = resolve_inside(root, relative)?;
    let parent = destination.parent().ok_or(VaultError::PathEscape)?;
    let temporary = parent.join(format!(".studio-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|_| VaultError::Unavailable)?;
        file.write_all(bytes).map_err(|_| VaultError::Unavailable)?;
        file.flush().map_err(|_| VaultError::Unavailable)?;
        file.sync_all().map_err(|_| VaultError::Unavailable)?;
        fs::rename(&temporary, &destination).map_err(|_| VaultError::Unavailable)?;
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| VaultError::Unavailable)?;
        Ok(hash(bytes))
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

#[tauri::command]
pub fn vault_read_text(root_token: String, path: String) -> Result<ReadTextResult, VaultError> {
    let bytes = read_bytes(&resolve_inside(&root(&root_token)?, &path)?)?;
    let text = String::from_utf8(bytes.clone()).map_err(|_| VaultError::Unavailable)?;
    Ok(ReadTextResult {
        text,
        hash: hash(&bytes),
    })
}

#[tauri::command]
pub fn vault_read_binary(root_token: String, path: String) -> Result<Vec<u8>, VaultError> {
    read_bytes(&resolve_inside(&root(&root_token)?, &path)?)
}

#[tauri::command]
pub fn vault_write_text_atomic(
    root_token: String,
    path: String,
    text: String,
    expected_hash: Option<String>,
) -> Result<HashResult, VaultError> {
    Ok(HashResult {
        hash: atomic_write(
            &root(&root_token)?,
            &path,
            text.as_bytes(),
            expected_hash.as_deref(),
        )?,
    })
}

#[tauri::command]
pub fn vault_write_binary_atomic(
    root_token: String,
    path: String,
    bytes: Vec<u8>,
) -> Result<HashResult, VaultError> {
    Ok(HashResult {
        hash: atomic_write(&root(&root_token)?, &path, &bytes, None)?,
    })
}

fn relative_string(root: &Path, path: &Path) -> Result<String, VaultError> {
    path.strip_prefix(root)
        .map_err(|_| VaultError::PathEscape)?
        .to_str()
        .map(str::to_owned)
        .ok_or(VaultError::Unavailable)
}

#[tauri::command]
pub fn vault_list(
    root_token: String,
    prefix: Option<String>,
) -> Result<Vec<VaultEntry>, VaultError> {
    let root = root(&root_token)?;
    let start = prefix
        .as_deref()
        .map(|p| resolve_inside(&root, p))
        .transpose()?
        .unwrap_or_else(|| root.clone());
    if !start.exists() {
        return Ok(Vec::new());
    }
    let mut pending = vec![start];
    let mut entries = Vec::new();
    while let Some(path) = pending.pop() {
        if path != root {
            let metadata = fs::symlink_metadata(&path).map_err(|_| VaultError::Unavailable)?;
            if metadata.file_type().is_symlink() {
                continue;
            }
            let is_dir = metadata.is_dir();
            let content_hash = if is_dir {
                None
            } else {
                Some(hash(&read_bytes(&path)?))
            };
            entries.push(VaultEntry {
                path: relative_string(&root, &path)?,
                kind: if is_dir { "directory" } else { "file" },
                size: (!is_dir).then_some(metadata.len()),
                modified_at: None,
                content_hash,
            });
        }
        if path.is_dir() {
            for child in fs::read_dir(path).map_err(|_| VaultError::Unavailable)? {
                pending.push(child.map_err(|_| VaultError::Unavailable)?.path());
            }
        }
    }
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

#[tauri::command]
pub fn vault_exists(root_token: String, path: String) -> Result<bool, VaultError> {
    Ok(resolve_inside(&root(&root_token)?, &path)?.exists())
}

#[tauri::command]
pub fn vault_move(root_token: String, from: String, to: String) -> Result<(), VaultError> {
    let root = root(&root_token)?;
    let source = resolve_inside(&root, &from)?;
    if !source.exists() {
        return Err(VaultError::Unavailable);
    }
    let destination = resolve_inside(&root, &to)?;
    if destination.exists() {
        return Err(VaultError::Conflict);
    }
    fs::create_dir_all(destination.parent().ok_or(VaultError::PathEscape)?)
        .map_err(|_| VaultError::Unavailable)?;
    fs::rename(source, destination).map_err(|_| VaultError::Unavailable)
}

#[tauri::command]
pub fn vault_remove(root_token: String, path: String) -> Result<(), VaultError> {
    let target = resolve_inside(&root(&root_token)?, &path)?;
    fs::remove_file(target).map_err(|_| VaultError::Unavailable)
}

#[tauri::command]
pub fn vault_watch(
    app: tauri::AppHandle<tauri::Wry>,
    root_token: String,
) -> Result<WatchRegistration, VaultError> {
    let watched_root = root(&root_token)?;
    let id = Uuid::new_v4().to_string();
    let event_name = format!("studio-vault-{id}");
    let emitted_name = event_name.clone();
    let callback_root = watched_root.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else { return };
        if matches!(
            event.kind,
            EventKind::Modify(ModifyKind::Name(RenameMode::Both))
        ) && event.paths.len() == 2
        {
            let previous = relative_string(&callback_root, &event.paths[0]);
            let current = relative_string(&callback_root, &event.paths[1]);
            if let (Ok(previous_path), Ok(path), Ok(bytes)) =
                (previous, current, read_bytes(&event.paths[1]))
            {
                let _ = app.emit(
                    &emitted_name,
                    WatchEvent::Moved {
                        path,
                        previous_path,
                        hash: hash(&bytes),
                    },
                );
            }
            return;
        }
        for changed in event.paths {
            let Ok(relative) = relative_string(&callback_root, &changed) else {
                continue;
            };
            let payload = match event.kind {
                EventKind::Create(_) => {
                    read_bytes(&changed).ok().map(|bytes| WatchEvent::Created {
                        path: relative,
                        hash: hash(&bytes),
                    })
                }
                EventKind::Modify(_) => {
                    read_bytes(&changed).ok().map(|bytes| WatchEvent::Modified {
                        path: relative,
                        hash: hash(&bytes),
                    })
                }
                EventKind::Remove(_) => Some(WatchEvent::Removed { path: relative }),
                _ => None,
            };
            if let Some(payload) = payload {
                let _ = app.emit(&emitted_name, payload);
            }
        }
    })
    .map_err(|_| VaultError::Unavailable)?;
    watcher
        .watch(&watched_root, RecursiveMode::Recursive)
        .map_err(|_| VaultError::Unavailable)?;
    WATCHERS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| VaultError::Unavailable)?
        .insert(id.clone(), watcher);
    Ok(WatchRegistration {
        id,
        event: event_name,
    })
}

#[tauri::command]
pub fn vault_unwatch(id: String) -> Result<(), VaultError> {
    WATCHERS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| VaultError::Unavailable)?
        .remove(&id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temp_file_is_replaced_atomically() {
        let dir = tempfile::tempdir().unwrap();
        atomic_write(dir.path(), "note.md", b"complete", None).unwrap();
        assert_eq!(fs::read(dir.path().join("note.md")).unwrap(), b"complete");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn expected_hash_conflict_preserves_old_content() {
        let dir = tempfile::tempdir().unwrap();
        atomic_write(dir.path(), "note.md", b"old", None).unwrap();
        assert!(matches!(
            atomic_write(dir.path(), "note.md", b"new", Some("stale")),
            Err(VaultError::Conflict)
        ));
        assert_eq!(fs::read(dir.path().join("note.md")).unwrap(), b"old");
    }

    #[test]
    fn repeated_atomic_replacement_is_never_partial() {
        let dir = tempfile::tempdir().unwrap();
        let old = vec![b'o'; 128 * 1024];
        let new = vec![b'n'; 128 * 1024];
        atomic_write(dir.path(), "note.md", &old, None).unwrap();
        let root = dir.path().to_owned();
        let replacement = new.clone();
        let writer =
            std::thread::spawn(move || atomic_write(&root, "note.md", &replacement, None).unwrap());
        while !writer.is_finished() {
            let observed = fs::read(dir.path().join("note.md")).unwrap();
            assert!(observed == old || observed == new);
        }
        writer.join().unwrap();
        assert_eq!(fs::read(dir.path().join("note.md")).unwrap(), new);
    }

    #[test]
    fn interrupted_pre_rename_write_preserves_old_file() {
        let dir = tempfile::tempdir().unwrap();
        atomic_write(dir.path(), "note.md", b"old", None).unwrap();
        let temporary = dir.path().join(".studio-interrupted.tmp");
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .unwrap();
        file.write_all(b"partial-new").unwrap();
        file.sync_all().unwrap();
        drop(file); // Process interruption before rename leaves the authoritative path untouched.
        assert_eq!(fs::read(dir.path().join("note.md")).unwrap(), b"old");
    }

    #[test]
    fn watcher_observes_committed_content_after_atomic_write() {
        use std::{sync::mpsc, time::Duration};
        let dir = tempfile::tempdir().unwrap();
        let watched = dir.path().to_owned();
        let (sender, receiver) = mpsc::channel();
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                if let Ok(event) = event
                    && event.paths.iter().any(|path| path.ends_with("note.md"))
                {
                    let _ = sender.send(fs::read(watched.join("note.md")));
                }
            })
            .unwrap();
        watcher.watch(dir.path(), RecursiveMode::Recursive).unwrap();
        atomic_write(dir.path(), "note.md", b"complete", None).unwrap();
        let visible = receiver
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .unwrap();
        assert_eq!(visible, b"complete");
    }
}
