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
    fs::{Dir, MetadataExt, OpenOptions, OpenOptionsExt},
};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{
    AppHandle, Emitter, Runtime, State, WebviewWindow,
    http::HeaderMap,
    ipc::{InvokeBody, Request, Response},
};
use uuid::Uuid;

use crate::security::path_guard::{
    is_internal_component, map_path_error, open_parent, validate_relative,
};

const VAULT_RECOVERY_ID_PATH: &str = ".studio-vault-id";
const VAULT_REVISION_PATH: &str = ".studio-revision";
const VAULT_TOKEN_HEADER: &str = "x-studio-vault-token";
const BATCH_MAGIC: &[u8; 8] = b"STUDIOB1";
const MAX_BATCH_BYTES: usize = 512 * 1024 * 1024;
const MAX_BATCH_WRITES: usize = 9_999;

fn is_user_note_path(path: &str) -> bool {
    if path.to_ascii_lowercase().starts_with(".studio/") {
        return false;
    }
    let name = path.rsplit('/').next().unwrap_or(path);
    name.to_ascii_lowercase().ends_with(".md") || !name.contains('.')
}

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
    pub recovery_identity: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashResult {
    pub hash: String,
}

#[derive(Debug)]
struct AtomicBatchWrite {
    path: String,
    bytes: Vec<u8>,
    expected_hash: Option<String>,
    expected_missing: bool,
}

#[derive(Debug)]
struct AtomicBatch {
    expected_revision: u64,
    expected_user_state: Option<Vec<ExpectedUserState>>,
    writes: Vec<AtomicBatchWrite>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtomicBatchResult {
    revision: String,
    results: Vec<AtomicBatchWriteResult>,
}

#[derive(Serialize)]
struct AtomicBatchWriteResult {
    path: String,
    hash: String,
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

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExpectedUserState {
    pub(crate) path: String,
    pub(crate) hash: String,
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
    _watcher: Option<RecommendedWatcher>,
    active: Arc<AtomicBool>,
}

impl Drop for WatchHandle {
    fn drop(&mut self) {
        self.active.store(false, Ordering::Release);
    }
}

type SharedWatchCallback = Arc<dyn Fn(notify::Result<notify::Event>) + Send + Sync>;
type SharedReconcile = Arc<dyn Fn() + Send + Sync>;

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
    ) -> Result<VaultSelection, VaultError> {
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
        let vault = Arc::new(Vault {
            root,
            write_lock: Mutex::new(()),
            write_lock_file,
            watchers: Mutex::new(HashMap::new()),
        });
        vault.get_revision()?;
        let selection = VaultSelection {
            vault_token: Uuid::new_v4().simple().to_string(),
            recovery_identity: vault.recovery_identity()?,
        };
        self.vaults
            .lock()
            .map_err(|_| VaultError::Unavailable)?
            .insert(
                selection.vault_token.clone(),
                RegisteredVault {
                    owner: owner.to_owned(),
                    vault,
                },
            );
        Ok(selection)
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
            .map(|selection| selection.vault_token)
    }

    #[cfg(test)]
    pub fn register_selected_path_selection_for_test(
        &self,
        owner: &str,
        path: &Path,
    ) -> Result<VaultSelection, VaultError> {
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

struct BatchCursor<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> BatchCursor<'a> {
    fn take(&mut self, length: usize) -> Result<&'a [u8], VaultError> {
        let end = self
            .offset
            .checked_add(length)
            .ok_or(VaultError::Unavailable)?;
        let value = self
            .bytes
            .get(self.offset..end)
            .ok_or(VaultError::Unavailable)?;
        self.offset = end;
        Ok(value)
    }

    fn byte(&mut self) -> Result<u8, VaultError> {
        Ok(self.take(1)?[0])
    }

    fn u32(&mut self) -> Result<usize, VaultError> {
        let bytes: [u8; 4] = self
            .take(4)?
            .try_into()
            .map_err(|_| VaultError::Unavailable)?;
        Ok(u32::from_le_bytes(bytes) as usize)
    }

    fn string(&mut self) -> Result<String, VaultError> {
        let length = self.u32()?;
        if length > 1024 {
            return Err(VaultError::PathEscape);
        }
        String::from_utf8(self.take(length)?.to_vec()).map_err(|_| VaultError::PathEscape)
    }
}

fn parse_revision(value: &str) -> Result<u64, VaultError> {
    if value.is_empty()
        || (value.len() > 1 && value.starts_with('0'))
        || !value.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(VaultError::Conflict);
    }
    value.parse().map_err(|_| VaultError::Conflict)
}

fn is_canonical_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn decode_atomic_batch(body: &InvokeBody) -> Result<AtomicBatch, VaultError> {
    let InvokeBody::Raw(bytes) = body else {
        return Err(VaultError::Unavailable);
    };
    if bytes.len() > MAX_BATCH_BYTES {
        return Err(VaultError::Unavailable);
    }
    let mut cursor = BatchCursor { bytes, offset: 0 };
    if cursor.take(BATCH_MAGIC.len())? != BATCH_MAGIC {
        return Err(VaultError::Unavailable);
    }
    let expected_revision = parse_revision(&cursor.string()?)?;
    let state_present = cursor.byte()?;
    if state_present > 1 {
        return Err(VaultError::Unavailable);
    }
    let state_count = cursor.u32()?;
    if state_count > MAX_BATCH_WRITES || (state_present == 0 && state_count != 0) {
        return Err(VaultError::Unavailable);
    }
    let mut expected_user_state = Vec::with_capacity(state_count);
    for _ in 0..state_count {
        let path = cursor.string()?;
        validate_relative(&path)?;
        let hash = cursor.string()?;
        if !is_canonical_hash(&hash) {
            return Err(VaultError::Unavailable);
        }
        expected_user_state.push(ExpectedUserState { path, hash });
    }
    let count = cursor.u32()?;
    if count > MAX_BATCH_WRITES {
        return Err(VaultError::Unavailable);
    }
    let mut writes = Vec::with_capacity(count);
    let mut paths = HashSet::with_capacity(count);
    for _ in 0..count {
        let path = cursor.string()?;
        validate_relative(&path)?;
        if !paths.insert(path.clone()) {
            return Err(VaultError::Conflict);
        }
        let flags = cursor.byte()?;
        if flags & !3 != 0 || flags == 3 {
            return Err(VaultError::Unavailable);
        }
        let expected_hash = if flags & 2 == 0 {
            None
        } else {
            let value = cursor.string()?;
            if !is_canonical_hash(&value) {
                return Err(VaultError::Unavailable);
            }
            Some(value)
        };
        let length = cursor.u32()?;
        if length > 64 * 1024 * 1024 {
            return Err(VaultError::Unavailable);
        }
        writes.push(AtomicBatchWrite {
            path,
            bytes: cursor.take(length)?.to_vec(),
            expected_hash,
            expected_missing: flags & 1 != 0,
        });
    }
    if cursor.offset != bytes.len() {
        return Err(VaultError::Unavailable);
    }
    Ok(AtomicBatch {
        expected_revision,
        expected_user_state: (state_present == 1).then_some(expected_user_state),
        writes,
    })
}

fn request_vault_token(headers: &HeaderMap) -> Result<&str, VaultError> {
    headers
        .get(VAULT_TOKEN_HEADER)
        .ok_or(VaultError::Unavailable)?
        .to_str()
        .map_err(|_| VaultError::Unavailable)
}

fn open_file_nofollow(directory: &Dir, basename: &str) -> Result<cap_std::fs::File, VaultError> {
    let mut options = OpenOptions::new();
    options
        .read(true)
        .custom_flags(libc::O_NONBLOCK)
        .follow(FollowSymlinks::No);
    let file = directory
        .open_with(basename, &options)
        .map_err(map_path_error)?;
    if !file
        .metadata()
        .map_err(|_| VaultError::Unavailable)?
        .is_file()
    {
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

    fn parse_recovery_identity(bytes: &[u8]) -> Result<String, VaultError> {
        let identity = std::str::from_utf8(bytes).map_err(|_| VaultError::Unavailable)?;
        let is_version_four = identity.as_bytes().get(12) == Some(&b'4');
        let has_rfc_variant =
            matches!(identity.as_bytes().get(16), Some(b'8' | b'9' | b'a' | b'b'));
        if identity.len() != 32
            || !identity
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            || !is_version_four
            || !has_rfc_variant
        {
            return Err(VaultError::Unavailable);
        }
        Ok(identity.to_owned())
    }

    fn read_recovery_identity(&self) -> Result<String, VaultError> {
        Self::parse_recovery_identity(&read_file_nofollow(&self.root, VAULT_RECOVERY_ID_PATH)?)
    }

    fn recovery_identity(&self) -> Result<String, VaultError> {
        let _write_guard = self.lock_writes()?;
        match self.root.symlink_metadata(VAULT_RECOVERY_ID_PATH) {
            Ok(metadata) => {
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err(VaultError::Unavailable);
                }
                return self.read_recovery_identity();
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(map_path_error(error)),
        }

        let identity = Uuid::new_v4().simple().to_string();
        let temporary = format!(".studio-{}.tmp", Uuid::new_v4().simple());
        let mut options = OpenOptions::new();
        options
            .create_new(true)
            .write(true)
            .follow(FollowSymlinks::No);
        let mut file = self
            .root
            .open_with(&temporary, &options)
            .map_err(map_path_error)?;
        let publish = (|| {
            file.write_all(identity.as_bytes())
                .map_err(|_| VaultError::Unavailable)?;
            file.flush().map_err(|_| VaultError::Unavailable)?;
            file.sync_all().map_err(|_| VaultError::Unavailable)?;
            drop(file);
            match rename_exclusive(&self.root, &temporary, &self.root, VAULT_RECOVERY_ID_PATH) {
                Ok(()) => {
                    sync_directory(&self.root)?;
                    Ok(identity)
                }
                Err(VaultError::Conflict) => {
                    let _ = self.root.remove_file(&temporary);
                    self.read_recovery_identity()
                }
                Err(error) => Err(error),
            }
        })();
        if publish.is_err() {
            let _ = self.root.remove_file(&temporary);
        }
        publish
    }

    fn write_internal_locked(&self, path: &str, bytes: &[u8]) -> Result<(), VaultError> {
        let temporary = format!(".studio-{}.tmp", Uuid::new_v4().simple());
        let mut options = OpenOptions::new();
        options
            .create_new(true)
            .write(true)
            .follow(FollowSymlinks::No);
        let mut file = self
            .root
            .open_with(&temporary, &options)
            .map_err(map_path_error)?;
        let result = (|| {
            file.write_all(bytes).map_err(|_| VaultError::Unavailable)?;
            file.flush().map_err(|_| VaultError::Unavailable)?;
            file.sync_all().map_err(|_| VaultError::Unavailable)?;
            drop(file);
            self.root
                .rename(&temporary, &self.root, path)
                .map_err(map_path_error)?;
            sync_directory(&self.root)
        })();
        if result.is_err() {
            let _ = self.root.remove_file(&temporary);
        }
        result
    }

    fn revision_locked(&self) -> Result<u64, VaultError> {
        match self.root.symlink_metadata(VAULT_REVISION_PATH) {
            Ok(metadata) => {
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err(VaultError::Unavailable);
                }
                let bytes = read_file_nofollow(&self.root, VAULT_REVISION_PATH)?;
                let value = std::str::from_utf8(&bytes).map_err(|_| VaultError::Unavailable)?;
                parse_revision(value).map_err(|_| VaultError::Unavailable)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                self.write_internal_locked(VAULT_REVISION_PATH, b"0")?;
                Ok(0)
            }
            Err(error) => Err(map_path_error(error)),
        }
    }

    fn reserve_revision_locked(&self) -> Result<u64, VaultError> {
        let next = self
            .revision_locked()?
            .checked_add(1)
            .ok_or(VaultError::Unavailable)?;
        self.write_internal_locked(VAULT_REVISION_PATH, next.to_string().as_bytes())?;
        Ok(next)
    }

    fn get_revision(&self) -> Result<String, VaultError> {
        let _write_guard = self.lock_writes()?;
        Ok(self.revision_locked()?.to_string())
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

    fn require_missing(directory: &Dir, basename: &str) -> Result<(), VaultError> {
        match directory.symlink_metadata(basename) {
            Ok(_) => Err(VaultError::Conflict),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(map_path_error(error)),
        }
    }

    fn require_write_condition(
        directory: &Dir,
        basename: &str,
        expected_hash: Option<&str>,
        expected_missing: bool,
    ) -> Result<(), VaultError> {
        if expected_missing {
            Self::require_missing(directory, basename)?;
        }
        if let Some(expected) = expected_hash {
            Self::require_expected_hash(directory, basename, expected)?;
        }
        Ok(())
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

    fn watch_retained_root<B, A>(
        &self,
        callback: SharedWatchCallback,
        before_first_registration: B,
        after_first_registration: A,
    ) -> Result<RecommendedWatcher, VaultError>
    where
        B: FnOnce(),
        A: FnOnce(),
    {
        let mut before_hook = Some(before_first_registration);
        let mut after_hook = Some(after_first_registration);
        for _ in 0..8 {
            let candidate = self.retained_root_path()?;
            if let Some(hook) = before_hook.take() {
                hook();
            }
            let callback = Arc::clone(&callback);
            let mut watcher = notify::recommended_watcher(move |event| callback(event))
                .map_err(|_| VaultError::Unavailable)?;
            watcher
                .watch(&candidate, RecursiveMode::Recursive)
                .map_err(|_| VaultError::Unavailable)?;

            if let Some(hook) = after_hook.take() {
                hook();
            }

            // F_GETPATH and notify both require a pathname boundary. Register first, then prove
            // that the pathname still names the retained directory. If an attacker replaced it
            // during registration, drop that watcher and retry from the descriptor's new path.
            // This closes an ordinary one-way replacement race. A hostile replace-then-restore
            // ABA can still fool a pathname backend, so all events are reconciled from the
            // retained capability and a periodic reconciliation provides eventual availability.
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
        let _write_guard = self.lock_writes()?;
        self.read_text_unlocked(path)
    }

    fn read_text_unlocked(&self, path: &str) -> Result<ReadTextResult, VaultError> {
        let parent = open_parent(&self.root, path, false)?;
        let bytes = read_file_nofollow(&parent.directory, &parent.basename)?;
        let text = String::from_utf8(bytes.clone()).map_err(|_| VaultError::Unavailable)?;
        Ok(ReadTextResult {
            text,
            hash: hash(&bytes),
        })
    }

    fn read_binary(&self, path: &str) -> Result<Vec<u8>, VaultError> {
        let _write_guard = self.lock_writes()?;
        self.read_binary_unlocked(path)
    }

    fn read_binary_unlocked(&self, path: &str) -> Result<Vec<u8>, VaultError> {
        let parent = open_parent(&self.root, path, false)?;
        read_file_nofollow(&parent.directory, &parent.basename)
    }

    fn write_atomic<F>(
        &self,
        path: &str,
        bytes: &[u8],
        expected_hash: Option<&str>,
        expected_missing: bool,
        expected_user_state: Option<&[ExpectedUserState]>,
        before_commit: F,
    ) -> Result<String, VaultError>
    where
        F: FnOnce(),
    {
        let _write_guard = self.lock_writes()?;
        let parent = open_parent(&self.root, path, true)?;
        Self::require_write_condition(
            &parent.directory,
            &parent.basename,
            expected_hash,
            expected_missing,
        )?;
        self.require_user_state(expected_user_state)?;
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

            Self::require_write_condition(
                &parent.directory,
                &parent.basename,
                expected_hash,
                expected_missing,
            )?;
            self.require_user_state(expected_user_state)?;
            self.reserve_revision_locked()?;
            if expected_missing {
                rename_exclusive(
                    &parent.directory,
                    &temporary,
                    &parent.directory,
                    &parent.basename,
                )?;
            } else {
                parent
                    .directory
                    .rename(&temporary, &parent.directory, &parent.basename)
                    .map_err(map_path_error)?;
            }
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
        expected_missing: bool,
        expected_user_state: Option<&[ExpectedUserState]>,
    ) -> Result<HashResult, VaultError> {
        Ok(HashResult {
            hash: self.write_atomic(
                path,
                text.as_bytes(),
                expected_hash,
                expected_missing,
                expected_user_state,
                || {},
            )?,
        })
    }

    fn write_binary_atomic(
        &self,
        path: &str,
        bytes: &[u8],
        expected_hash: Option<&str>,
        expected_missing: bool,
        expected_user_state: Option<&[ExpectedUserState]>,
    ) -> Result<HashResult, VaultError> {
        Ok(HashResult {
            hash: self.write_atomic(
                path,
                bytes,
                expected_hash,
                expected_missing,
                expected_user_state,
                || {},
            )?,
        })
    }

    fn publish_bytes_locked(&self, path: &str, bytes: &[u8]) -> Result<(), VaultError> {
        let parent = open_parent(&self.root, path, true)?;
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
        let result = (|| {
            file.write_all(bytes).map_err(|_| VaultError::Unavailable)?;
            file.flush().map_err(|_| VaultError::Unavailable)?;
            file.sync_all().map_err(|_| VaultError::Unavailable)?;
            drop(file);
            parent
                .directory
                .rename(&temporary, &parent.directory, &parent.basename)
                .map_err(map_path_error)?;
            sync_directory(&parent.directory)
        })();
        if result.is_err() {
            let _ = parent.directory.remove_file(&temporary);
        }
        result
    }

    fn write_batch_atomic_inner(
        &self,
        batch: AtomicBatch,
        fail_before_publication: Option<usize>,
        after_publication: Option<&dyn Fn(usize)>,
    ) -> Result<AtomicBatchResult, VaultError> {
        struct PreparedWrite {
            path: String,
            temporary: String,
            previous: Option<Vec<u8>>,
            expected_hash: Option<String>,
            expected_missing: bool,
            hash: String,
        }

        if batch.writes.is_empty() || batch.writes.len() > MAX_BATCH_WRITES {
            return Err(VaultError::Unavailable);
        }
        let _write_guard = self.lock_writes()?;
        if self.revision_locked()? != batch.expected_revision {
            return Err(VaultError::Conflict);
        }
        self.require_user_state(batch.expected_user_state.as_deref())?;
        let mut seen = HashSet::with_capacity(batch.writes.len());
        let mut prepared: Vec<PreparedWrite> = Vec::with_capacity(batch.writes.len());
        for write in batch.writes {
            if !seen.insert(write.path.clone()) {
                for write in &prepared {
                    if let Ok(parent) = open_parent(&self.root, &write.path, false) {
                        let _ = parent.directory.remove_file(&write.temporary);
                    }
                }
                return Err(VaultError::Conflict);
            }
            let prepare_result = (|| {
                let parent = open_parent(&self.root, &write.path, true)?;
                Self::require_write_condition(
                    &parent.directory,
                    &parent.basename,
                    write.expected_hash.as_deref(),
                    write.expected_missing,
                )?;
                let previous = match parent.directory.symlink_metadata(&parent.basename) {
                    Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                        Some(read_file_nofollow(&parent.directory, &parent.basename)?)
                    }
                    Ok(_) => return Err(VaultError::PathEscape),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                    Err(error) => return Err(map_path_error(error)),
                };
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
                let write_result = file
                    .write_all(&write.bytes)
                    .and_then(|_| file.flush())
                    .and_then(|_| file.sync_all());
                if let Err(error) = write_result {
                    let _ = parent.directory.remove_file(&temporary);
                    return Err(map_path_error(error));
                }
                Ok(PreparedWrite {
                    path: write.path,
                    temporary,
                    previous,
                    expected_hash: write.expected_hash,
                    expected_missing: write.expected_missing,
                    hash: hash(&write.bytes),
                })
            })();
            match prepare_result {
                Ok(write) => prepared.push(write),
                Err(error) => {
                    for write in &prepared {
                        if let Ok(parent) = open_parent(&self.root, &write.path, false) {
                            let _ = parent.directory.remove_file(&write.temporary);
                        }
                    }
                    return Err(error);
                }
            }
        }

        if let Err(error) = self.require_user_state(batch.expected_user_state.as_deref()) {
            for write in &prepared {
                if let Ok(parent) = open_parent(&self.root, &write.path, false) {
                    let _ = parent.directory.remove_file(&write.temporary);
                }
            }
            return Err(error);
        }
        let revision = match self.reserve_revision_locked() {
            Ok(revision) => revision,
            Err(error) => {
                for write in &prepared {
                    if let Ok(parent) = open_parent(&self.root, &write.path, false) {
                        let _ = parent.directory.remove_file(&write.temporary);
                    }
                }
                return Err(error);
            }
        };
        let mut applied = Vec::new();
        let publish_result = (|| {
            for (index, write) in prepared.iter().enumerate() {
                if fail_before_publication == Some(index) {
                    return Err(VaultError::Unavailable);
                }
                let parent = open_parent(&self.root, &write.path, true)?;
                Self::require_write_condition(
                    &parent.directory,
                    &parent.basename,
                    write.expected_hash.as_deref(),
                    write.expected_missing,
                )?;
                if write.expected_missing {
                    rename_exclusive(
                        &parent.directory,
                        &write.temporary,
                        &parent.directory,
                        &parent.basename,
                    )?;
                } else {
                    parent
                        .directory
                        .rename(&write.temporary, &parent.directory, &parent.basename)
                        .map_err(map_path_error)?;
                }
                applied.push(index);
                sync_directory(&parent.directory)?;
                if let Some(callback) = after_publication {
                    callback(index);
                }
            }
            Ok(())
        })();

        if let Err(error) = publish_result {
            let mut rollback_failed = false;
            for index in applied.into_iter().rev() {
                let write = &prepared[index];
                let rollback = if let Some(previous) = &write.previous {
                    match open_parent(&self.root, &write.path, false).and_then(|parent| {
                        Self::require_expected_hash(
                            &parent.directory,
                            &parent.basename,
                            &write.hash,
                        )
                    }) {
                        Ok(()) => self.publish_bytes_locked(&write.path, previous),
                        Err(error) => Err(error),
                    }
                } else {
                    match open_parent(&self.root, &write.path, false) {
                        Ok(parent) => Self::require_expected_hash(
                            &parent.directory,
                            &parent.basename,
                            &write.hash,
                        )
                        .and_then(|_| {
                            parent
                                .directory
                                .remove_file(&parent.basename)
                                .map_err(map_path_error)
                        })
                        .and_then(|_| sync_directory(&parent.directory)),
                        Err(error) => Err(error),
                    }
                };
                if rollback.is_err() {
                    rollback_failed = true;
                }
            }
            for write in &prepared {
                if let Ok(parent) = open_parent(&self.root, &write.path, false) {
                    let _ = parent.directory.remove_file(&write.temporary);
                }
            }
            return Err(if rollback_failed {
                VaultError::Unavailable
            } else {
                error
            });
        }

        Ok(AtomicBatchResult {
            revision: revision.to_string(),
            results: prepared
                .into_iter()
                .map(|write| AtomicBatchWriteResult {
                    path: write.path,
                    hash: write.hash,
                })
                .collect(),
        })
    }

    fn write_batch_atomic(&self, batch: AtomicBatch) -> Result<AtomicBatchResult, VaultError> {
        self.write_batch_atomic_inner(batch, None, None)
    }

    fn user_note_state(&self) -> Result<Vec<ExpectedUserState>, VaultError> {
        let mut state = self
            .list_unlocked(None)?
            .into_iter()
            .filter(|entry| entry.kind == "file" && is_user_note_path(&entry.path))
            .map(|entry| {
                Ok(ExpectedUserState {
                    path: entry.path,
                    hash: entry.content_hash.ok_or(VaultError::Unavailable)?,
                })
            })
            .collect::<Result<Vec<_>, VaultError>>()?;
        state.sort_by(|left, right| left.path.cmp(&right.path));
        Ok(state)
    }

    fn require_user_state(
        &self,
        expected_user_state: Option<&[ExpectedUserState]>,
    ) -> Result<(), VaultError> {
        if let Some(expected) = expected_user_state {
            let mut observed = expected.to_vec();
            observed.sort_by(|left, right| left.path.cmp(&right.path));
            if self.user_note_state()? != observed {
                return Err(VaultError::Conflict);
            }
        }
        Ok(())
    }

    pub fn move_path(
        &self,
        from: &str,
        to: &str,
        expected_hash: Option<&str>,
        expected_user_state: Option<&[ExpectedUserState]>,
    ) -> Result<(), VaultError> {
        let _write_guard = self.lock_writes()?;
        let from_parent = open_parent(&self.root, from, false)?;
        let metadata = from_parent
            .directory
            .symlink_metadata(&from_parent.basename)
            .map_err(map_path_error)?;
        if metadata.file_type().is_symlink() {
            return Err(VaultError::PathEscape);
        }
        if let Some(expected) = expected_hash {
            Self::require_expected_hash(&from_parent.directory, &from_parent.basename, expected)?;
        }
        self.require_user_state(expected_user_state)?;
        let to_parent = open_parent(&self.root, to, true)?;
        self.reserve_revision_locked()?;
        rename_exclusive(
            &from_parent.directory,
            &from_parent.basename,
            &to_parent.directory,
            &to_parent.basename,
        )?;
        sync_directory(&from_parent.directory)?;
        sync_directory(&to_parent.directory)
    }

    fn remove(
        &self,
        path: &str,
        expected_hash: Option<&str>,
        expected_missing: bool,
        expected_user_state: Option<&[ExpectedUserState]>,
    ) -> Result<(), VaultError> {
        let _write_guard = self.lock_writes()?;
        let parent = open_parent(&self.root, path, false)?;
        let metadata = parent
            .directory
            .symlink_metadata(&parent.basename)
            .map_err(map_path_error)?;
        if metadata.file_type().is_symlink() {
            return Err(VaultError::PathEscape);
        }
        if expected_missing {
            return Err(VaultError::Conflict);
        }
        if let Some(expected) = expected_hash {
            Self::require_expected_hash(&parent.directory, &parent.basename, expected)?;
        }
        self.require_user_state(expected_user_state)?;
        self.reserve_revision_locked()?;
        parent
            .directory
            .remove_file(&parent.basename)
            .map_err(map_path_error)?;
        sync_directory(&parent.directory)
    }

    fn exists(&self, path: &str) -> Result<bool, VaultError> {
        let _write_guard = self.lock_writes()?;
        self.exists_unlocked(path)
    }

    fn exists_unlocked(&self, path: &str) -> Result<bool, VaultError> {
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
        let _write_guard = self.lock_writes()?;
        self.list_unlocked(prefix)
    }

    fn list_unlocked(&self, prefix: Option<&str>) -> Result<Vec<VaultEntry>, VaultError> {
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
        // Watch reconciliation must never observe or emit an intermediate batch state.
        let _write_guard = self.lock_writes()?;
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
        self.start_watch_with_hooks(app, || {}, || {})
    }

    fn start_watch_with_hooks<R, B, A>(
        self: &Arc<Self>,
        app: AppHandle<R>,
        before_first_registration: B,
        after_first_registration: A,
    ) -> Result<WatchRegistration, VaultError>
    where
        R: Runtime,
        B: FnOnce(),
        A: FnOnce(),
    {
        let id = Uuid::new_v4().simple().to_string();
        let event_name = format!("studio-vault-{id}");
        let current = Arc::new(Mutex::new(self.snapshot()?));
        let running = Arc::new(AtomicBool::new(false));
        let dirty = Arc::new(AtomicBool::new(false));
        let vault = Arc::downgrade(self);
        let periodic_vault = Weak::clone(&vault);
        let emitted_name = event_name.clone();
        let reconcile: SharedReconcile = Arc::new(move || {
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
        let callback_reconcile = Arc::clone(&reconcile);
        let callback: SharedWatchCallback = Arc::new(move |_raw_event| callback_reconcile());
        let watcher = self.watch_retained_root(
            callback,
            before_first_registration,
            after_first_registration,
        )?;
        let active = Arc::new(AtomicBool::new(true));
        let periodic_active = Arc::clone(&active);
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_secs(2));
                if !periodic_active.load(Ordering::Acquire) || periodic_vault.upgrade().is_none() {
                    break;
                }
                reconcile();
            }
        });
        self.watchers
            .lock()
            .map_err(|_| VaultError::Unavailable)?
            .insert(
                id.clone(),
                WatchHandle {
                    _watcher: Some(watcher),
                    active,
                },
            );
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
        expected_user_state: Option<&[ExpectedUserState]>,
        before_commit: F,
    ) -> Result<String, VaultError>
    where
        F: FnOnce(),
    {
        self.write_atomic(
            path,
            text.as_bytes(),
            expected_hash,
            false,
            expected_user_state,
            before_commit,
        )
    }

    #[cfg(test)]
    pub fn write_text_atomic_for_test(
        &self,
        path: &str,
        text: &str,
        expected_hash: Option<&str>,
    ) -> Result<String, VaultError> {
        self.write_atomic(path, text.as_bytes(), expected_hash, false, None, || {})
    }

    #[cfg(test)]
    pub fn write_binary_atomic_for_test(
        &self,
        path: &str,
        bytes: &[u8],
        expected_hash: Option<&str>,
        expected_missing: bool,
    ) -> Result<String, VaultError> {
        self.write_atomic(path, bytes, expected_hash, expected_missing, None, || {})
    }

    #[cfg(test)]
    pub fn read_binary_for_test(&self, path: &str) -> Result<Vec<u8>, VaultError> {
        self.read_binary(path)
    }

    #[cfg(test)]
    pub fn start_watch_with_registration_hooks_for_test<R, B, A>(
        self: &Arc<Self>,
        app: AppHandle<R>,
        before_first_registration: B,
        after_first_registration: A,
    ) -> Result<WatchRegistration, VaultError>
    where
        R: Runtime,
        B: FnOnce(),
        A: FnOnce(),
    {
        self.start_watch_with_hooks(app, before_first_registration, after_first_registration)
    }

    #[cfg(test)]
    pub fn drop_native_watcher_for_test(&self, id: &str) {
        if let Ok(mut watchers) = self.watchers.lock()
            && let Some(handle) = watchers.get_mut(id)
        {
            handle._watcher = None;
        }
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
    Ok(Some(state.register_selected_path(window.label(), &path)?))
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
) -> Result<Response, VaultError> {
    Ok(Response::new(
        selected_vault(&window, &state, &vault_token)?.read_binary(&path)?,
    ))
}

#[tauri::command]
pub fn vault_get_revision<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
) -> Result<String, VaultError> {
    selected_vault(&window, &state, &vault_token)?.get_revision()
}

#[tauri::command]
pub fn vault_write_batch_atomic<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    request: Request<'_>,
) -> Result<AtomicBatchResult, VaultError> {
    let vault_token = request_vault_token(request.headers())?;
    let batch = decode_atomic_batch(request.body())?;
    selected_vault(&window, &state, vault_token)?.write_batch_atomic(batch)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn vault_write_text_atomic<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    path: String,
    text: String,
    expected_hash: Option<String>,
    expected_missing: Option<bool>,
    expected_user_state: Option<Vec<ExpectedUserState>>,
) -> Result<HashResult, VaultError> {
    selected_vault(&window, &state, &vault_token)?.write_text_atomic(
        &path,
        &text,
        expected_hash.as_deref(),
        expected_missing.unwrap_or(false),
        expected_user_state.as_deref(),
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn vault_write_binary_atomic<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    path: String,
    bytes: Vec<u8>,
    expected_hash: Option<String>,
    expected_missing: Option<bool>,
    expected_user_state: Option<Vec<ExpectedUserState>>,
) -> Result<HashResult, VaultError> {
    selected_vault(&window, &state, &vault_token)?.write_binary_atomic(
        &path,
        &bytes,
        expected_hash.as_deref(),
        expected_missing.unwrap_or(false),
        expected_user_state.as_deref(),
    )
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
    expected_hash: Option<String>,
    expected_user_state: Option<Vec<ExpectedUserState>>,
) -> Result<(), VaultError> {
    selected_vault(&window, &state, &vault_token)?.move_path(
        &from,
        &to,
        expected_hash.as_deref(),
        expected_user_state.as_deref(),
    )
}

#[tauri::command]
pub fn vault_remove<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    path: String,
    expected_hash: Option<String>,
    expected_missing: Option<bool>,
    expected_user_state: Option<Vec<ExpectedUserState>>,
) -> Result<(), VaultError> {
    selected_vault(&window, &state, &vault_token)?.remove(
        &path,
        expected_hash.as_deref(),
        expected_missing.unwrap_or(false),
        expected_user_state.as_deref(),
    )
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

    fn selected_vault() -> (tempfile::TempDir, Arc<Vault>) {
        let directory = tempfile::tempdir().unwrap();
        let registry = VaultRegistry::default();
        let selection = registry
            .register_selected_path("test", directory.path())
            .unwrap();
        let vault = registry.vault("test", &selection.vault_token).unwrap();
        (directory, vault)
    }

    fn push_string(bytes: &mut Vec<u8>, value: &str) {
        bytes.extend_from_slice(&(value.len() as u32).to_le_bytes());
        bytes.extend_from_slice(value.as_bytes());
    }

    #[test]
    fn raw_batch_envelope_preserves_binary_bytes_without_json_expansion() {
        let mut bytes = BATCH_MAGIC.to_vec();
        push_string(&mut bytes, "12");
        bytes.push(0);
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u32.to_le_bytes());
        push_string(&mut bytes, ".studio/assets/image.bin");
        bytes.push(1);
        let payload = [0, 1, 2, 127, 128, 255];
        bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        bytes.extend_from_slice(&payload);

        let decoded = decode_atomic_batch(&InvokeBody::Raw(bytes.clone())).unwrap();
        assert_eq!(decoded.expected_revision, 12);
        assert_eq!(decoded.expected_user_state, None);
        assert_eq!(decoded.writes[0].bytes, payload);
        assert!(bytes.len() < 80);
        assert!(matches!(
            decode_atomic_batch(&InvokeBody::Json(r#"{"bytes":[0,1,2,127,128,255]}"#.into())),
            Err(VaultError::Unavailable)
        ));
    }

    #[test]
    fn revision_is_monotonic_across_aba_writes_and_reopen() {
        let (directory, vault) = selected_vault();
        assert_eq!(vault.get_revision().unwrap(), "0");

        vault
            .write_text_atomic("note.md", "a", None, false, None)
            .unwrap();
        let first = parse_revision(&vault.get_revision().unwrap()).unwrap();
        vault
            .write_text_atomic("note.md", "b", None, false, None)
            .unwrap();
        let second = parse_revision(&vault.get_revision().unwrap()).unwrap();
        vault
            .write_text_atomic("note.md", "a", None, false, None)
            .unwrap();
        let third = parse_revision(&vault.get_revision().unwrap()).unwrap();

        assert!(first < second && second < third);
        drop(vault);

        let reopened = VaultRegistry::default();
        let selection = reopened
            .register_selected_path("reopen", directory.path())
            .unwrap();
        assert_eq!(
            reopened
                .vault("reopen", &selection.vault_token)
                .unwrap()
                .get_revision()
                .unwrap(),
            third.to_string()
        );
    }

    #[test]
    fn atomic_batch_rolls_back_every_published_file_on_failure() {
        let (_directory, vault) = selected_vault();
        vault
            .write_text_atomic("first.md", "before", None, false, None)
            .unwrap();
        let expected_revision = parse_revision(&vault.get_revision().unwrap()).unwrap();
        let result = vault.write_batch_atomic_inner(
            AtomicBatch {
                expected_revision,
                expected_user_state: None,
                writes: vec![
                    AtomicBatchWrite {
                        path: "first.md".into(),
                        bytes: b"after".to_vec(),
                        expected_hash: Some(hash(b"before")),
                        expected_missing: false,
                    },
                    AtomicBatchWrite {
                        path: "second.bin".into(),
                        bytes: vec![0, 1, 2, 255],
                        expected_hash: None,
                        expected_missing: true,
                    },
                ],
            },
            Some(1),
            None,
        );

        assert!(matches!(result, Err(VaultError::Unavailable)));
        assert_eq!(vault.read_binary("first.md").unwrap(), b"before");
        assert!(!vault.exists("second.bin").unwrap());
        assert!(parse_revision(&vault.get_revision().unwrap()).unwrap() > expected_revision);
    }

    #[test]
    fn atomic_batch_publishes_all_files_under_one_revision() {
        let (_directory, vault) = selected_vault();
        let expected_revision = parse_revision(&vault.get_revision().unwrap()).unwrap();
        let result = vault
            .write_batch_atomic(AtomicBatch {
                expected_revision,
                expected_user_state: Some(vec![]),
                writes: vec![
                    AtomicBatchWrite {
                        path: "one.md".into(),
                        bytes: b"one".to_vec(),
                        expected_hash: None,
                        expected_missing: true,
                    },
                    AtomicBatchWrite {
                        path: ".studio/assets/two.bin".into(),
                        bytes: vec![0, 255, 7],
                        expected_hash: None,
                        expected_missing: true,
                    },
                ],
            })
            .unwrap();

        assert_eq!(
            parse_revision(&result.revision).unwrap(),
            expected_revision + 1
        );
        assert_eq!(vault.read_binary("one.md").unwrap(), b"one");
        assert_eq!(
            vault.read_binary(".studio/assets/two.bin").unwrap(),
            vec![0, 255, 7]
        );
    }

    #[test]
    fn public_readers_cannot_observe_a_partially_published_batch() {
        let (_directory, vault) = selected_vault();
        let expected_revision = parse_revision(&vault.get_revision().unwrap()).unwrap();
        let publishing_vault = Arc::clone(&vault);
        let (published, wait_for_release) = std::sync::mpsc::channel();
        let (release, released) = std::sync::mpsc::channel();
        let (batch_done, batch_result) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let after_publication = |index| {
                if index == 0 {
                    published.send(()).unwrap();
                    released.recv().unwrap();
                }
            };
            let result = publishing_vault.write_batch_atomic_inner(
                AtomicBatch {
                    expected_revision,
                    expected_user_state: None,
                    writes: vec![
                        AtomicBatchWrite {
                            path: "first.bin".into(),
                            bytes: b"first".to_vec(),
                            expected_hash: None,
                            expected_missing: true,
                        },
                        AtomicBatchWrite {
                            path: "second.bin".into(),
                            bytes: b"second".to_vec(),
                            expected_hash: None,
                            expected_missing: true,
                        },
                    ],
                },
                None,
                Some(&after_publication),
            );
            batch_done.send(result).unwrap();
        });
        wait_for_release
            .recv_timeout(Duration::from_secs(1))
            .unwrap();

        let observing_vault = Arc::clone(&vault);
        let (read_done, read_result) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            read_done
                .send(observing_vault.read_binary("first.bin"))
                .unwrap()
        });
        assert!(matches!(
            read_result.recv_timeout(Duration::from_millis(50)),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout)
        ));

        release.send(()).unwrap();
        batch_result
            .recv_timeout(Duration::from_secs(1))
            .unwrap()
            .unwrap();
        assert_eq!(
            read_result
                .recv_timeout(Duration::from_secs(1))
                .unwrap()
                .unwrap(),
            b"first"
        );
        assert_eq!(vault.read_binary("second.bin").unwrap(), b"second");
    }

    #[test]
    fn watcher_snapshots_wait_for_the_native_transaction_lock() {
        let (_directory, vault) = selected_vault();
        vault
            .write_text_atomic("note.md", "stable", None, false, None)
            .unwrap();
        let guard = vault.lock_writes().unwrap();
        let observing_vault = Arc::clone(&vault);
        let (send, receive) = std::sync::mpsc::channel();
        std::thread::spawn(move || send.send(observing_vault.snapshot()).unwrap());

        assert!(matches!(
            receive.recv_timeout(Duration::from_millis(50)),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout)
        ));
        drop(guard);
        let snapshot = receive
            .recv_timeout(Duration::from_secs(1))
            .unwrap()
            .unwrap();
        assert_eq!(snapshot.get("note.md").unwrap().hash, hash(b"stable"));
    }

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
