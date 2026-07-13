use std::{
    collections::{BTreeMap, HashMap, HashSet},
    ffi::{CStr, CString, OsStr},
    io::{Read, Write},
    os::{fd::AsRawFd, unix::ffi::OsStrExt},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, MutexGuard, Weak,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, MetadataExt, OpenOptions},
};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Runtime, State, WebviewWindow};
use uuid::Uuid;

use crate::security::path_guard::{map_path_error, open_parent, validate_relative};

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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSelection {
    pub vault_token: String,
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
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

#[derive(Clone, Debug, PartialEq, Eq)]
struct SnapshotFile {
    hash: String,
    size: u64,
}

struct WatchHandle {
    _watcher: RecommendedWatcher,
}

type SharedWatchCallback = Arc<dyn Fn(notify::Result<notify::Event>) + Send + Sync>;

pub struct Vault {
    root: Dir,
    write_lock: Mutex<()>,
    write_lock_file: std::fs::File,
    watchers: Mutex<HashMap<String, WatchHandle>>,
}

struct WriteGuard<'a> {
    _local: MutexGuard<'a, ()>,
    file: &'a std::fs::File,
}

impl Drop for WriteGuard<'_> {
    fn drop(&mut self) {
        // SAFETY: `file` remains open for the guard's lifetime. Unlocking an already-unlocked
        // descriptor is harmless, and there is no recovery action available during Drop.
        let _ = unsafe { libc::flock(self.file.as_raw_fd(), libc::LOCK_UN) };
    }
}

struct RegisteredVault {
    owner: String,
    vault: Arc<Vault>,
}

#[derive(Default)]
pub struct VaultRegistry {
    vaults: Mutex<HashMap<String, RegisteredVault>>,
}

impl VaultRegistry {
    fn register_selected_path(
        &self,
        owner: &str,
        selected_path: &Path,
    ) -> Result<String, VaultError> {
        // Native selection is the only ambient-authority boundary. Open it immediately and
        // retain the resulting directory descriptor; later commands never reopen this path.
        let root = Dir::open_ambient_dir(selected_path, ambient_authority())
            .map_err(|_| VaultError::Unavailable)?;
        let mut lock_options = OpenOptions::new();
        lock_options
            .read(true)
            .write(true)
            .create(true)
            .follow(FollowSymlinks::No);
        let write_lock_file = root
            .open_with(".studio-write.lock", &lock_options)
            .map_err(map_path_error)?
            .into_std();
        let token = Uuid::new_v4().simple().to_string();
        self.vaults
            .lock()
            .map_err(|_| VaultError::Unavailable)?
            .insert(
                token.clone(),
                RegisteredVault {
                    owner: owner.to_owned(),
                    vault: Arc::new(Vault {
                        root,
                        write_lock: Mutex::new(()),
                        write_lock_file,
                        watchers: Mutex::new(HashMap::new()),
                    }),
                },
            );
        Ok(token)
    }

    fn vault(&self, owner: &str, token: &str) -> Result<Arc<Vault>, VaultError> {
        let vaults = self.vaults.lock().map_err(|_| VaultError::Unavailable)?;
        let registered = vaults.get(token).ok_or(VaultError::Unavailable)?;
        if registered.owner != owner {
            return Err(VaultError::Unavailable);
        }
        Ok(Arc::clone(&registered.vault))
    }

    pub fn revoke_owner(&self, owner: &str) {
        if let Ok(mut vaults) = self.vaults.lock() {
            vaults.retain(|_, registered| registered.owner != owner);
        }
    }

    pub fn revoke_all(&self) {
        if let Ok(mut vaults) = self.vaults.lock() {
            vaults.clear();
        }
    }

    #[cfg(test)]
    pub fn register_selected_path_for_test(
        &self,
        owner: &str,
        path: &Path,
    ) -> Result<String, VaultError> {
        self.register_selected_path(owner, path)
    }

    #[cfg(test)]
    pub fn vault_for_test(&self, owner: &str, token: &str) -> Result<Arc<Vault>, VaultError> {
        self.vault(owner, token)
    }

    #[cfg(test)]
    pub fn capability_count_for_test(&self) -> usize {
        self.vaults.lock().map(|vaults| vaults.len()).unwrap_or(0)
    }
}

fn hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn open_file_nofollow(directory: &Dir, basename: &str) -> Result<cap_std::fs::File, VaultError> {
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    directory
        .open_with(basename, &options)
        .map_err(map_path_error)
}

fn read_file_nofollow(directory: &Dir, basename: &str) -> Result<Vec<u8>, VaultError> {
    let mut bytes = Vec::new();
    open_file_nofollow(directory, basename)?
        .read_to_end(&mut bytes)
        .map_err(|_| VaultError::Unavailable)?;
    Ok(bytes)
}

fn sync_directory(directory: &Dir) -> Result<(), VaultError> {
    directory
        .try_clone()
        .and_then(|clone| clone.into_std_file().sync_all())
        .map_err(|_| VaultError::Unavailable)
}

fn c_name(name: &str) -> Result<CString, VaultError> {
    CString::new(name).map_err(|_| VaultError::PathEscape)
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn renameatx_np(
        fromfd: libc::c_int,
        from: *const libc::c_char,
        tofd: libc::c_int,
        to: *const libc::c_char,
        flags: libc::c_uint,
    ) -> libc::c_int;
}

#[cfg(target_os = "macos")]
fn macos_rename(
    from_dir: &Dir,
    from: &str,
    to_dir: &Dir,
    to: &str,
    flags: libc::c_uint,
) -> Result<(), std::io::Error> {
    let from_fd = from_dir.try_clone()?.into_std_file();
    let to_fd = to_dir.try_clone()?.into_std_file();
    let from = c_name(from).map_err(|_| std::io::Error::from_raw_os_error(libc::EINVAL))?;
    let to = c_name(to).map_err(|_| std::io::Error::from_raw_os_error(libc::EINVAL))?;
    // SAFETY: both directory descriptors and NUL-terminated basename pointers remain valid
    // for the duration of this single syscall.
    let result = unsafe {
        renameatx_np(
            from_fd.as_raw_fd(),
            from.as_ptr(),
            to_fd.as_raw_fd(),
            to.as_ptr(),
            flags,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
fn rename_exclusive(from_dir: &Dir, from: &str, to_dir: &Dir, to: &str) -> Result<(), VaultError> {
    const RENAME_EXCL: libc::c_uint = 0x0000_0004;
    macos_rename(from_dir, from, to_dir, to, RENAME_EXCL).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            VaultError::Conflict
        } else {
            VaultError::Unavailable
        }
    })
}

#[cfg(not(target_os = "macos"))]
fn rename_exclusive(
    _from_dir: &Dir,
    _from: &str,
    _to_dir: &Dir,
    _to: &str,
) -> Result<(), VaultError> {
    Err(VaultError::Unavailable)
}

impl Vault {
    fn lock_writes(&self) -> Result<WriteGuard<'_>, VaultError> {
        let local = self
            .write_lock
            .lock()
            .map_err(|_| VaultError::Unavailable)?;
        loop {
            // SAFETY: the lock descriptor is retained by `self`, and `WriteGuard` ensures the
            // advisory lock is released after the in-process mutex.
            if unsafe { libc::flock(self.write_lock_file.as_raw_fd(), libc::LOCK_EX) } == 0 {
                return Ok(WriteGuard {
                    _local: local,
                    file: &self.write_lock_file,
                });
            }
            if std::io::Error::last_os_error().kind() != std::io::ErrorKind::Interrupted {
                return Err(VaultError::Unavailable);
            }
        }
    }

    fn require_expected_hash(
        directory: &Dir,
        basename: &str,
        expected: &str,
    ) -> Result<(), VaultError> {
        match read_file_nofollow(directory, basename) {
            Ok(bytes) if hash(&bytes) == expected => Ok(()),
            Err(VaultError::PathEscape) => Err(VaultError::PathEscape),
            _ => Err(VaultError::Conflict),
        }
    }

    #[cfg(target_os = "macos")]
    fn retained_root_path(&self) -> Result<PathBuf, VaultError> {
        let descriptor = self
            .root
            .try_clone()
            .map_err(|_| VaultError::Unavailable)?
            .into_std_file();
        let mut buffer = [0 as libc::c_char; libc::PATH_MAX as usize];
        // SAFETY: the descriptor is open, and `buffer` is writable for PATH_MAX bytes. macOS
        // writes a NUL-terminated path for F_GETPATH on success.
        let result =
            unsafe { libc::fcntl(descriptor.as_raw_fd(), libc::F_GETPATH, buffer.as_mut_ptr()) };
        if result == -1 {
            return Err(VaultError::Unavailable);
        }
        // SAFETY: F_GETPATH guarantees NUL termination on success.
        let bytes = unsafe { CStr::from_ptr(buffer.as_ptr()) }.to_bytes();
        Ok(PathBuf::from(OsStr::from_bytes(bytes)))
    }

    #[cfg(not(target_os = "macos"))]
    fn retained_root_path(&self) -> Result<PathBuf, VaultError> {
        Err(VaultError::Unavailable)
    }

    fn watch_retained_root<F>(
        &self,
        callback: SharedWatchCallback,
        after_first_registration: F,
    ) -> Result<RecommendedWatcher, VaultError>
    where
        F: FnOnce(),
    {
        let mut registration_hook = Some(after_first_registration);
        for _ in 0..8 {
            let candidate = self.retained_root_path()?;
            let callback = Arc::clone(&callback);
            let mut watcher = notify::recommended_watcher(move |event| callback(event))
                .map_err(|_| VaultError::Unavailable)?;
            watcher
                .watch(&candidate, RecursiveMode::Recursive)
                .map_err(|_| VaultError::Unavailable)?;

            if let Some(hook) = registration_hook.take() {
                hook();
            }

            // F_GETPATH and notify both require a pathname boundary. Register first, then prove
            // that the pathname still names the retained directory. If an attacker replaced it
            // during registration, drop that watcher and retry from the descriptor's new path.
            // Once identity matches, the already-registered native watcher owns the vnode; later
            // pathname replacement cannot retarget that registration.
            let retained = self
                .root
                .dir_metadata()
                .map_err(|_| VaultError::Unavailable)?;
            let registered = match std::fs::metadata(&candidate) {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if retained.dev() == std::os::unix::fs::MetadataExt::dev(&registered)
                && retained.ino() == std::os::unix::fs::MetadataExt::ino(&registered)
            {
                return Ok(watcher);
            }
        }
        Err(VaultError::Unavailable)
    }

    pub fn read_text(&self, path: &str) -> Result<ReadTextResult, VaultError> {
        let parent = open_parent(&self.root, path, false)?;
        let bytes = read_file_nofollow(&parent.directory, &parent.basename)?;
        let text = String::from_utf8(bytes.clone()).map_err(|_| VaultError::Unavailable)?;
        Ok(ReadTextResult {
            text,
            hash: hash(&bytes),
        })
    }

    fn read_binary(&self, path: &str) -> Result<Vec<u8>, VaultError> {
        let parent = open_parent(&self.root, path, false)?;
        read_file_nofollow(&parent.directory, &parent.basename)
    }

    fn write_atomic<F>(
        &self,
        path: &str,
        bytes: &[u8],
        expected_hash: Option<&str>,
        before_commit: F,
    ) -> Result<String, VaultError>
    where
        F: FnOnce(),
    {
        let _write_guard = self.lock_writes()?;
        let parent = open_parent(&self.root, path, true)?;
        if let Some(expected) = expected_hash {
            Self::require_expected_hash(&parent.directory, &parent.basename, expected)?;
        }
        let temporary = format!(".studio-{}.tmp", Uuid::new_v4().simple());
        let mut options = OpenOptions::new();
        options
            .create_new(true)
            .write(true)
            .follow(FollowSymlinks::No);
        let mut file = parent
            .directory
            .open_with(&temporary, &options)
            .map_err(map_path_error)?;
        let write_result = (|| {
            file.write_all(bytes).map_err(|_| VaultError::Unavailable)?;
            file.flush().map_err(|_| VaultError::Unavailable)?;
            file.sync_all().map_err(|_| VaultError::Unavailable)?;
            drop(file);
            before_commit();

            if let Some(expected) = expected_hash {
                Self::require_expected_hash(&parent.directory, &parent.basename, expected)?;
            }
            parent
                .directory
                .rename(&temporary, &parent.directory, &parent.basename)
                .map_err(map_path_error)?;
            sync_directory(&parent.directory)?;
            Ok(hash(bytes))
        })();
        if write_result.is_err() {
            let _ = parent.directory.remove_file(&temporary);
        }
        write_result
    }

    fn write_text_atomic(
        &self,
        path: &str,
        text: &str,
        expected_hash: Option<&str>,
    ) -> Result<HashResult, VaultError> {
        Ok(HashResult {
            hash: self.write_atomic(path, text.as_bytes(), expected_hash, || {})?,
        })
    }

    fn write_binary_atomic(&self, path: &str, bytes: &[u8]) -> Result<HashResult, VaultError> {
        Ok(HashResult {
            hash: self.write_atomic(path, bytes, None, || {})?,
        })
    }

    pub fn move_path(&self, from: &str, to: &str) -> Result<(), VaultError> {
        let _write_guard = self.lock_writes()?;
        let from_parent = open_parent(&self.root, from, false)?;
        let metadata = from_parent
            .directory
            .symlink_metadata(&from_parent.basename)
            .map_err(map_path_error)?;
        if metadata.file_type().is_symlink() {
            return Err(VaultError::PathEscape);
        }
        let to_parent = open_parent(&self.root, to, true)?;
        rename_exclusive(
            &from_parent.directory,
            &from_parent.basename,
            &to_parent.directory,
            &to_parent.basename,
        )?;
        sync_directory(&from_parent.directory)?;
        sync_directory(&to_parent.directory)
    }

    fn remove(&self, path: &str) -> Result<(), VaultError> {
        let _write_guard = self.lock_writes()?;
        let parent = open_parent(&self.root, path, false)?;
        let metadata = parent
            .directory
            .symlink_metadata(&parent.basename)
            .map_err(map_path_error)?;
        if metadata.file_type().is_symlink() {
            return Err(VaultError::PathEscape);
        }
        parent
            .directory
            .remove_file(&parent.basename)
            .map_err(map_path_error)?;
        sync_directory(&parent.directory)
    }

    fn exists(&self, path: &str) -> Result<bool, VaultError> {
        let parent = match open_parent(&self.root, path, false) {
            Ok(parent) => parent,
            Err(VaultError::Unavailable) => return Ok(false),
            Err(error) => return Err(error),
        };
        match parent.directory.symlink_metadata(&parent.basename) {
            Ok(metadata) if metadata.file_type().is_symlink() => Err(VaultError::PathEscape),
            Ok(_) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(map_path_error(error)),
        }
    }

    fn list(&self, prefix: Option<&str>) -> Result<Vec<VaultEntry>, VaultError> {
        let mut entries = Vec::new();
        match prefix {
            None => collect_entries(&self.root, "", &mut entries)?,
            Some(prefix) => {
                validate_relative(prefix)?;
                let parent = open_parent(&self.root, prefix, false)?;
                let metadata = match parent.directory.symlink_metadata(&parent.basename) {
                    Ok(metadata) => metadata,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                        return Ok(Vec::new());
                    }
                    Err(error) => return Err(map_path_error(error)),
                };
                if metadata.file_type().is_symlink() {
                    return Err(VaultError::PathEscape);
                }
                if metadata.is_dir() {
                    let directory = parent
                        .directory
                        .open_dir_nofollow(&parent.basename)
                        .map_err(map_path_error)?;
                    collect_entries(&directory, prefix, &mut entries)?;
                } else {
                    push_file_entry(&parent.directory, &parent.basename, prefix, &mut entries)?;
                }
            }
        }
        entries.sort_by(|left, right| left.path.cmp(&right.path));
        Ok(entries)
    }

    fn snapshot(&self) -> Result<BTreeMap<String, SnapshotFile>, VaultError> {
        let mut entries = Vec::new();
        collect_entries(&self.root, "", &mut entries)?;
        Ok(entries
            .into_iter()
            .filter_map(|entry| {
                Some((
                    entry.path,
                    SnapshotFile {
                        hash: entry.content_hash?,
                        size: entry.size?,
                    },
                ))
            })
            .collect())
    }

    fn start_watch<R: Runtime>(
        self: &Arc<Self>,
        app: AppHandle<R>,
    ) -> Result<WatchRegistration, VaultError> {
        self.start_watch_with_hook(app, || {})
    }

    fn start_watch_with_hook<R, F>(
        self: &Arc<Self>,
        app: AppHandle<R>,
        after_first_registration: F,
    ) -> Result<WatchRegistration, VaultError>
    where
        R: Runtime,
        F: FnOnce(),
    {
        let id = Uuid::new_v4().simple().to_string();
        let event_name = format!("studio-vault-{id}");
        let current = Arc::new(Mutex::new(self.snapshot()?));
        let running = Arc::new(AtomicBool::new(false));
        let dirty = Arc::new(AtomicBool::new(false));
        let vault = Arc::downgrade(self);
        let emitted_name = event_name.clone();
        let callback: SharedWatchCallback = Arc::new(move |_raw_event| {
            dirty.store(true, Ordering::Release);
            if running.swap(true, Ordering::AcqRel) {
                return;
            }
            let vault = Weak::clone(&vault);
            let current = Arc::clone(&current);
            let running = Arc::clone(&running);
            let dirty = Arc::clone(&dirty);
            let app = app.clone();
            let emitted_name = emitted_name.clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(Duration::from_millis(50));
                    dirty.store(false, Ordering::Release);
                    let Some(vault) = vault.upgrade() else {
                        running.store(false, Ordering::Release);
                        return;
                    };
                    if let Ok(next) = vault.snapshot()
                        && let Ok(mut previous) = current.lock()
                    {
                        for event in logical_changes(&previous, &next) {
                            let _ = app.emit(&emitted_name, event);
                        }
                        *previous = next;
                    }
                    if dirty.load(Ordering::Acquire) {
                        continue;
                    }
                    running.store(false, Ordering::Release);
                    if !dirty.swap(false, Ordering::AcqRel) || running.swap(true, Ordering::AcqRel)
                    {
                        break;
                    }
                }
            });
        });
        let watcher = self.watch_retained_root(callback, after_first_registration)?;
        self.watchers
            .lock()
            .map_err(|_| VaultError::Unavailable)?
            .insert(id.clone(), WatchHandle { _watcher: watcher });
        Ok(WatchRegistration {
            id,
            event: event_name,
        })
    }

    fn stop_watch(&self, id: &str) -> Result<(), VaultError> {
        self.watchers
            .lock()
            .map_err(|_| VaultError::Unavailable)?
            .remove(id);
        Ok(())
    }

    #[cfg(test)]
    pub fn write_text_atomic_with_before_commit_for_test<F>(
        &self,
        path: &str,
        text: &str,
        expected_hash: Option<&str>,
        before_commit: F,
    ) -> Result<String, VaultError>
    where
        F: FnOnce(),
    {
        self.write_atomic(path, text.as_bytes(), expected_hash, before_commit)
    }

    #[cfg(test)]
    pub fn write_text_atomic_for_test(
        &self,
        path: &str,
        text: &str,
        expected_hash: Option<&str>,
    ) -> Result<String, VaultError> {
        self.write_atomic(path, text.as_bytes(), expected_hash, || {})
    }

    #[cfg(test)]
    pub fn start_watch_with_registration_hook_for_test<R, F>(
        self: &Arc<Self>,
        app: AppHandle<R>,
        after_first_registration: F,
    ) -> Result<WatchRegistration, VaultError>
    where
        R: Runtime,
        F: FnOnce(),
    {
        self.start_watch_with_hook(app, after_first_registration)
    }
}

fn collect_entries(
    directory: &Dir,
    prefix: &str,
    entries: &mut Vec<VaultEntry>,
) -> Result<(), VaultError> {
    for entry in directory.entries().map_err(|_| VaultError::Unavailable)? {
        let entry = entry.map_err(|_| VaultError::Unavailable)?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| VaultError::Unavailable)?;
        if name.starts_with(".studio-") {
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
                kind: "directory",
                size: None,
                modified_at: None,
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
    let bytes = read_file_nofollow(directory, basename)?;
    entries.push(VaultEntry {
        path: path.to_owned(),
        kind: "file",
        size: Some(bytes.len() as u64),
        modified_at: None,
        content_hash: Some(hash(&bytes)),
    });
    Ok(())
}

fn logical_changes(
    previous: &BTreeMap<String, SnapshotFile>,
    next: &BTreeMap<String, SnapshotFile>,
) -> Vec<WatchEvent> {
    let mut events = Vec::new();
    let mut removed: Vec<_> = previous
        .iter()
        .filter(|(path, _)| !next.contains_key(*path))
        .map(|(path, file)| (path.clone(), file.clone()))
        .collect();
    let mut created: Vec<_> = next
        .iter()
        .filter(|(path, _)| !previous.contains_key(*path))
        .map(|(path, file)| (path.clone(), file.clone()))
        .collect();
    let mut used_created = HashSet::new();
    let mut used_removed = HashSet::new();

    for (removed_index, (previous_path, old_file)) in removed.iter().enumerate() {
        if let Some((created_index, (path, new_file))) = created
            .iter()
            .enumerate()
            .find(|(index, (_, file))| !used_created.contains(index) && file.hash == old_file.hash)
        {
            used_removed.insert(removed_index);
            used_created.insert(created_index);
            events.push(WatchEvent::Moved {
                path: path.clone(),
                previous_path: previous_path.clone(),
                hash: new_file.hash.clone(),
            });
        }
    }
    for (index, (path, _)) in removed.drain(..).enumerate() {
        if !used_removed.contains(&index) {
            events.push(WatchEvent::Removed { path });
        }
    }
    for (index, (path, file)) in created.drain(..).enumerate() {
        if !used_created.contains(&index) {
            events.push(WatchEvent::Created {
                path,
                hash: file.hash,
            });
        }
    }
    for (path, file) in next {
        if let Some(old_file) = previous.get(path)
            && old_file != file
        {
            events.push(WatchEvent::Modified {
                path: path.clone(),
                hash: file.hash.clone(),
            });
        }
    }
    events.sort_by(|left, right| format!("{left:?}").cmp(&format!("{right:?}")));
    events
}

fn selected_vault<R: Runtime>(
    window: &WebviewWindow<R>,
    state: &State<'_, VaultRegistry>,
    token: &str,
) -> Result<Arc<Vault>, VaultError> {
    state.vault(window.label(), token)
}

#[tauri::command]
pub fn vault_select<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
) -> Result<Option<VaultSelection>, VaultError> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("Choose a Studio vault")
        .pick_folder()
    else {
        return Ok(None);
    };
    Ok(Some(VaultSelection {
        vault_token: state.register_selected_path(window.label(), &path)?,
    }))
}

#[tauri::command]
pub fn vault_read_text<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    path: String,
) -> Result<ReadTextResult, VaultError> {
    selected_vault(&window, &state, &vault_token)?.read_text(&path)
}

#[tauri::command]
pub fn vault_read_binary<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    path: String,
) -> Result<Vec<u8>, VaultError> {
    selected_vault(&window, &state, &vault_token)?.read_binary(&path)
}

#[tauri::command]
pub fn vault_write_text_atomic<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    path: String,
    text: String,
    expected_hash: Option<String>,
) -> Result<HashResult, VaultError> {
    selected_vault(&window, &state, &vault_token)?.write_text_atomic(
        &path,
        &text,
        expected_hash.as_deref(),
    )
}

#[tauri::command]
pub fn vault_write_binary_atomic<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    path: String,
    bytes: Vec<u8>,
) -> Result<HashResult, VaultError> {
    selected_vault(&window, &state, &vault_token)?.write_binary_atomic(&path, &bytes)
}

#[tauri::command]
pub fn vault_list<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    prefix: Option<String>,
) -> Result<Vec<VaultEntry>, VaultError> {
    selected_vault(&window, &state, &vault_token)?.list(prefix.as_deref())
}

#[tauri::command]
pub fn vault_exists<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    path: String,
) -> Result<bool, VaultError> {
    selected_vault(&window, &state, &vault_token)?.exists(&path)
}

#[tauri::command]
pub fn vault_move<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    from: String,
    to: String,
) -> Result<(), VaultError> {
    selected_vault(&window, &state, &vault_token)?.move_path(&from, &to)
}

#[tauri::command]
pub fn vault_remove<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    path: String,
) -> Result<(), VaultError> {
    selected_vault(&window, &state, &vault_token)?.remove(&path)
}

#[tauri::command]
pub fn vault_watch<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
) -> Result<WatchRegistration, VaultError> {
    selected_vault(&window, &state, &vault_token)?.start_watch(app)
}

#[tauri::command]
pub fn vault_unwatch<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    id: String,
) -> Result<(), VaultError> {
    selected_vault(&window, &state, &vault_token)?.stop_watch(&id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logical_diff_coalesces_a_rename() {
        let previous = BTreeMap::from([(
            "before.md".to_owned(),
            SnapshotFile {
                hash: "same".to_owned(),
                size: 4,
            },
        )]);
        let next = BTreeMap::from([(
            "after.md".to_owned(),
            SnapshotFile {
                hash: "same".to_owned(),
                size: 4,
            },
        )]);
        assert_eq!(
            logical_changes(&previous, &next),
            vec![WatchEvent::Moved {
                path: "after.md".to_owned(),
                previous_path: "before.md".to_owned(),
                hash: "same".to_owned(),
            }]
        );
    }
}
