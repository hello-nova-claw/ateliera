use std::{
    collections::{BTreeMap, HashMap, HashSet},
    ffi::{CStr, CString, OsStr},
    io::{Read, Seek, SeekFrom, Write},
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
    is_internal_component, map_path_error, open_existing_parent_optional, open_parent,
    validate_relative,
};

const VAULT_RECOVERY_ID_PATH: &str = ".studio-vault-id";
const VAULT_REVISION_PATH: &str = ".studio-revision";
const BATCH_JOURNAL_PATH: &str = ".studio-batch-journal";
const BATCH_JOURNAL_MANIFEST: &str = "manifest.json";
const MAX_JOURNAL_MANIFEST_BYTES: usize = 8 * 1024 * 1024;
const VAULT_TOKEN_HEADER: &str = "x-studio-vault-token";
const BATCH_MAGIC: &[u8; 8] = b"STUDIOB1";
const MAX_BATCH_BYTES: usize = 512 * 1024 * 1024;
const MAX_BATCH_WRITES: usize = 9_999;
const MAX_PORTABLE_ENTRY_BYTES: u64 = 64 * 1024 * 1024;
const MAX_BINARY_CHUNK_BYTES: usize = 4 * 1024 * 1024;
const HASH_BUFFER_BYTES: usize = 64 * 1024;

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

struct PreparedWrite {
    path: String,
    temporary: String,
    previous: Option<Vec<u8>>,
    expected_hash: Option<String>,
    expected_missing: bool,
    hash: String,
    bytes: Vec<u8>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum JournalPhase {
    Preparing,
    Publishing,
    Committed,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct BatchJournalEntry {
    path: String,
    temporary: String,
    previous_backup: Option<String>,
    previous_hash: Option<String>,
    new_hash: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct BatchJournal {
    version: u8,
    original_revision: u64,
    reserved_revision: u64,
    phase: JournalPhase,
    progress: usize,
    entries: Vec<BatchJournalEntry>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BatchCrashPoint {
    PreparedManifest,
    StagedData,
    PublishingManifest,
    RevisionReserved,
    Published(usize),
    ProgressPersisted(usize),
    CommittedManifest,
    JournalRemoved,
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
        vault.recover_batch()?;
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

fn stream_file_hash(file: &mut impl Read) -> Result<(u64, String), VaultError> {
    let mut digest = Sha256::new();
    let mut total = 0u64;
    let mut buffer = [0u8; HASH_BUFFER_BYTES];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| VaultError::Unavailable)?;
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

fn read_file_nofollow_bounded(
    directory: &Dir,
    basename: &str,
    maximum: usize,
) -> Result<Vec<u8>, VaultError> {
    read_exact_bounded_after_stat(open_file_nofollow(directory, basename)?, maximum, || {})
}

fn read_exact_bounded_after_stat<F>(
    mut file: cap_std::fs::File,
    maximum: usize,
    after_stat: F,
) -> Result<Vec<u8>, VaultError>
where
    F: FnOnce(),
{
    let size = file.metadata().map_err(|_| VaultError::Unavailable)?.len();
    let size = usize::try_from(size).map_err(|_| VaultError::Unavailable)?;
    if size > maximum {
        return Err(VaultError::Unavailable);
    }
    after_stat();
    let mut bytes = vec![0; size];
    file.read_exact(&mut bytes)
        .map_err(|_| VaultError::Unavailable)?;
    let mut probe = [0_u8; 1];
    if file.read(&mut probe).map_err(|_| VaultError::Unavailable)? != 0 {
        return Err(VaultError::Unavailable);
    }
    Ok(bytes)
}

fn read_recovery_payload_after_stat<F>(
    directory: &Dir,
    basename: &str,
    retained: &mut usize,
    maximum: usize,
    after_stat: F,
) -> Result<Vec<u8>, VaultError>
where
    F: FnOnce(),
{
    let remaining = maximum
        .checked_sub(*retained)
        .ok_or(VaultError::Unavailable)?;
    let bytes = read_exact_bounded_after_stat(
        open_file_nofollow(directory, basename)?,
        remaining,
        after_stat,
    )?;
    *retained = retained
        .checked_add(bytes.len())
        .filter(|total| *total <= maximum)
        .ok_or(VaultError::Unavailable)?;
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
        self.recover_pending_locked()?;
        Ok(self.revision_locked()?.to_string())
    }

    fn write_synced_file(directory: &Dir, name: &str, bytes: &[u8]) -> Result<(), VaultError> {
        let mut options = OpenOptions::new();
        options
            .create_new(true)
            .write(true)
            .follow(FollowSymlinks::No);
        let mut file = directory
            .open_with(name, &options)
            .map_err(map_path_error)?;
        file.write_all(bytes).map_err(|_| VaultError::Unavailable)?;
        file.flush().map_err(|_| VaultError::Unavailable)?;
        file.sync_all().map_err(|_| VaultError::Unavailable)?;
        Ok(())
    }

    fn write_journal_manifest_locked(
        &self,
        directory: &Dir,
        journal: &BatchJournal,
    ) -> Result<(), VaultError> {
        let bytes = serde_json::to_vec(journal).map_err(|_| VaultError::Unavailable)?;
        if bytes.len() > MAX_JOURNAL_MANIFEST_BYTES {
            return Err(VaultError::Unavailable);
        }
        let temporary = format!("manifest-{}.tmp", Uuid::new_v4().simple());
        Self::write_synced_file(directory, &temporary, &bytes)?;
        let result = directory
            .rename(&temporary, directory, BATCH_JOURNAL_MANIFEST)
            .map_err(map_path_error)
            .and_then(|_| sync_directory(directory));
        if result.is_err() {
            let _ = directory.remove_file(&temporary);
        }
        result
    }

    fn cleanup_batch_journal_locked(&self) -> Result<(), VaultError> {
        match self.root.symlink_metadata(BATCH_JOURNAL_PATH) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
                let directory = self
                    .root
                    .open_dir_nofollow(BATCH_JOURNAL_PATH)
                    .map_err(map_path_error)?;
                self.retire_batch_journal_manifest_locked(&directory)?;
                self.root
                    .remove_dir_all(BATCH_JOURNAL_PATH)
                    .map_err(map_path_error)?;
            }
            Ok(_) => self
                .root
                .remove_file(BATCH_JOURNAL_PATH)
                .map_err(map_path_error)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(map_path_error(error)),
        }
        sync_directory(&self.root)
    }

    fn retire_batch_journal_manifest_locked(&self, directory: &Dir) -> Result<(), VaultError> {
        match directory.remove_file(BATCH_JOURNAL_MANIFEST) {
            Ok(()) => sync_directory(directory),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(map_path_error(error)),
        }
    }

    fn validate_journal(journal: &BatchJournal) -> Result<(), VaultError> {
        if journal.version != 1
            || journal.entries.is_empty()
            || journal.entries.len() > MAX_BATCH_WRITES
            || journal.reserved_revision
                != journal
                    .original_revision
                    .checked_add(1)
                    .ok_or(VaultError::Unavailable)?
            || journal.progress > journal.entries.len()
            || (journal.phase == JournalPhase::Preparing && journal.progress != 0)
            || (journal.phase == JournalPhase::Committed
                && journal.progress != journal.entries.len())
        {
            return Err(VaultError::Unavailable);
        }
        let mut paths = HashSet::with_capacity(journal.entries.len());
        for (index, entry) in journal.entries.iter().enumerate() {
            validate_relative(&entry.path)?;
            if entry.path.len() > 1024
                || !paths.insert(&entry.path)
                || !entry.temporary.starts_with(".studio-")
                || !entry.temporary.ends_with(".tmp")
                || entry.temporary.len() > 96
                || entry.temporary.contains('/')
                || !is_canonical_hash(&entry.new_hash)
                || entry
                    .previous_hash
                    .as_deref()
                    .is_some_and(|value| !is_canonical_hash(value))
                || entry.previous_backup.as_deref()
                    != entry
                        .previous_hash
                        .as_ref()
                        .map(|_| format!("previous-{index}.bin"))
                        .as_deref()
            {
                return Err(VaultError::Unavailable);
            }
        }
        Ok(())
    }

    fn read_journal_locked(&self) -> Result<Option<(Dir, BatchJournal)>, VaultError> {
        let metadata = match self.root.symlink_metadata(BATCH_JOURNAL_PATH) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(map_path_error(error)),
        };
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(VaultError::Unavailable);
        }
        let directory = self
            .root
            .open_dir_nofollow(BATCH_JOURNAL_PATH)
            .map_err(map_path_error)?;
        let mut bytes = Vec::new();
        open_file_nofollow(&directory, BATCH_JOURNAL_MANIFEST)?
            .take((MAX_JOURNAL_MANIFEST_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| VaultError::Unavailable)?;
        if bytes.len() > MAX_JOURNAL_MANIFEST_BYTES {
            return Err(VaultError::Unavailable);
        }
        let journal: BatchJournal =
            serde_json::from_slice(&bytes).map_err(|_| VaultError::Unavailable)?;
        Self::validate_journal(&journal)?;
        Ok(Some((directory, journal)))
    }

    fn cleanup_staged_temps_locked(&self, journal: &BatchJournal) -> Result<(), VaultError> {
        for entry in &journal.entries {
            let parent = match open_existing_parent_optional(&self.root, &entry.path)? {
                Some(parent) => parent,
                None => continue,
            };
            match parent.directory.symlink_metadata(&entry.temporary) {
                Ok(_) => {
                    parent
                        .directory
                        .remove_file(&entry.temporary)
                        .map_err(map_path_error)?;
                    sync_directory(&parent.directory)?;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(map_path_error(error)),
            }
        }
        Ok(())
    }

    fn read_optional_target_locked(
        &self,
        path: &str,
        retained: &mut usize,
    ) -> Result<Option<Vec<u8>>, VaultError> {
        let parent = match open_existing_parent_optional(&self.root, path)? {
            Some(parent) => parent,
            None => return Ok(None),
        };
        match parent.directory.symlink_metadata(&parent.basename) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                Ok(Some(read_recovery_payload_after_stat(
                    &parent.directory,
                    &parent.basename,
                    retained,
                    MAX_BATCH_BYTES,
                    || {},
                )?))
            }
            Ok(_) => Err(VaultError::PathEscape),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(map_path_error(error)),
        }
    }

    fn read_optional_staged_locked(
        &self,
        entry: &BatchJournalEntry,
        retained: &mut usize,
    ) -> Result<Option<Vec<u8>>, VaultError> {
        let parent = match open_existing_parent_optional(&self.root, &entry.path)? {
            Some(parent) => parent,
            None => return Ok(None),
        };
        match parent.directory.symlink_metadata(&entry.temporary) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                Ok(Some(read_recovery_payload_after_stat(
                    &parent.directory,
                    &entry.temporary,
                    retained,
                    MAX_BATCH_BYTES,
                    || {},
                )?))
            }
            Ok(_) => Err(VaultError::PathEscape),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(map_path_error(error)),
        }
    }

    fn optional_regular_file_len(directory: &Dir, name: &str) -> Result<Option<usize>, VaultError> {
        match directory.symlink_metadata(name) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                usize::try_from(metadata.len())
                    .map(Some)
                    .map_err(|_| VaultError::Unavailable)
            }
            Ok(_) => Err(VaultError::PathEscape),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(map_path_error(error)),
        }
    }

    fn target_and_staged_lengths_locked(
        &self,
        entry: &BatchJournalEntry,
    ) -> Result<(Option<usize>, Option<usize>), VaultError> {
        let parent = match open_existing_parent_optional(&self.root, &entry.path)? {
            Some(parent) => parent,
            None => return Ok((None, None)),
        };
        Ok((
            Self::optional_regular_file_len(&parent.directory, &parent.basename)?,
            Self::optional_regular_file_len(&parent.directory, &entry.temporary)?,
        ))
    }

    fn preflight_recovery_budget_locked(
        &self,
        directory: &Dir,
        journal: &BatchJournal,
    ) -> Result<(), VaultError> {
        let mut aggregate = 0usize;
        let mut include = |size: Option<usize>| -> Result<(), VaultError> {
            if let Some(size) = size {
                aggregate = aggregate
                    .checked_add(size)
                    .filter(|total| *total <= MAX_BATCH_BYTES)
                    .ok_or(VaultError::Unavailable)?;
            }
            Ok(())
        };
        for entry in &journal.entries {
            let backup = match entry.previous_backup.as_deref() {
                Some(path) => Self::optional_regular_file_len(directory, path)?,
                None => None,
            };
            let (target, staged) = self.target_and_staged_lengths_locked(entry)?;
            include(backup)?;
            include(target)?;
            include(staged)?;
        }
        Ok(())
    }

    fn recover_journal_locked(
        &self,
        directory: &Dir,
        journal: &BatchJournal,
    ) -> Result<(), VaultError> {
        enum RecoveryAction {
            Restore {
                path: String,
                previous: Vec<u8>,
                expected_current_hash: String,
            },
            Remove {
                path: String,
                expected_current_hash: String,
            },
        }

        let current_revision = self.revision_locked()?;
        if current_revision != journal.original_revision
            && current_revision != journal.reserved_revision
        {
            return Err(VaultError::Unavailable);
        }
        if journal.phase == JournalPhase::Preparing && current_revision != journal.original_revision
        {
            return Err(VaultError::Unavailable);
        }

        // The recovery process can retain prior-state, current-target, and staged-new payloads at
        // the same time. Bound that complete allocation set from metadata before allocating or
        // mutating anything. A forged journal remains available for explicit recovery.
        self.preflight_recovery_budget_locked(directory, journal)?;

        // Preflight pass 1: load and checksum every prior-state payload before inspecting or
        // changing any target. Publishing/committed journals must have the complete backup set.
        let mut backups = Vec::with_capacity(journal.entries.len());
        let mut retained_bytes = 0usize;
        for entry in &journal.entries {
            let previous = match (&entry.previous_backup, &entry.previous_hash) {
                (Some(backup), Some(previous_hash)) => {
                    let bytes = match directory.symlink_metadata(backup) {
                        Ok(metadata)
                            if metadata.is_file() && !metadata.file_type().is_symlink() =>
                        {
                            Some(read_recovery_payload_after_stat(
                                directory,
                                backup,
                                &mut retained_bytes,
                                MAX_BATCH_BYTES,
                                || {},
                            )?)
                        }
                        Err(error)
                            if error.kind() == std::io::ErrorKind::NotFound
                                && journal.phase == JournalPhase::Preparing =>
                        {
                            None
                        }
                        _ => return Err(VaultError::Unavailable),
                    };
                    if let Some(bytes) = &bytes
                        && hash(bytes) != *previous_hash
                    {
                        return Err(VaultError::Unavailable);
                    }
                    bytes
                }
                (None, None) => None,
                _ => return Err(VaultError::Unavailable),
            };
            backups.push(previous);
        }

        // Preflight pass 2: snapshot every current target and every surviving staged new-state
        // payload. A checksum failure anywhere aborts before the action list is applied.
        let mut targets = Vec::with_capacity(journal.entries.len());
        let mut staged = Vec::with_capacity(journal.entries.len());
        for entry in &journal.entries {
            let current = self.read_optional_target_locked(&entry.path, &mut retained_bytes)?;
            let staged_bytes = self.read_optional_staged_locked(entry, &mut retained_bytes)?;
            if staged_bytes
                .as_ref()
                .is_some_and(|bytes| hash(bytes) != entry.new_hash)
            {
                return Err(VaultError::Unavailable);
            }
            targets.push(current);
            staged.push(staged_bytes);
        }

        // Preflight pass 3: classify the complete transaction and build an immutable action list.
        let mut actions = Vec::new();
        match journal.phase {
            JournalPhase::Preparing => {
                for ((entry, backup), current) in journal.entries.iter().zip(&backups).zip(&targets)
                {
                    match (&entry.previous_hash, backup, current) {
                        (Some(previous_hash), Some(_), Some(bytes))
                            if hash(bytes) == *previous_hash => {}
                        // A preparing journal may precede creation of its backup, but the target
                        // must still contain the original file.
                        (Some(previous_hash), None, Some(bytes))
                            if hash(bytes) == *previous_hash => {}
                        (None, None, None) => {}
                        _ => return Err(VaultError::Conflict),
                    }
                }
            }
            JournalPhase::Committed => {
                if current_revision != journal.reserved_revision {
                    return Err(VaultError::Unavailable);
                }
                for ((entry, current), staged_bytes) in
                    journal.entries.iter().zip(&targets).zip(&staged)
                {
                    if current
                        .as_ref()
                        .is_none_or(|bytes| hash(bytes) != entry.new_hash)
                        || staged_bytes.is_some()
                    {
                        return Err(VaultError::Conflict);
                    }
                }
            }
            JournalPhase::Publishing => {
                for (((entry, backup), current), staged_bytes) in journal
                    .entries
                    .iter()
                    .zip(&backups)
                    .zip(&targets)
                    .zip(&staged)
                {
                    match (&entry.previous_hash, backup, current) {
                        (Some(previous_hash), Some(_), Some(bytes))
                            if entry.new_hash == *previous_hash
                                && hash(bytes) == *previous_hash => {}
                        (Some(_), Some(previous), Some(bytes)) if hash(bytes) == entry.new_hash => {
                            if staged_bytes.is_some() {
                                return Err(VaultError::Unavailable);
                            }
                            actions.push(RecoveryAction::Restore {
                                path: entry.path.clone(),
                                previous: previous.clone(),
                                expected_current_hash: entry.new_hash.clone(),
                            });
                        }
                        (Some(previous_hash), Some(_), Some(bytes))
                            if hash(bytes) == *previous_hash =>
                        {
                            // The target is already in the chosen rollback state. Its staged
                            // new-state file may have been removed by an interrupted cleanup.
                        }
                        // Missing content for a file known to have existed is never reconstructed
                        // speculatively; it is an external conflict and the evidence is retained.
                        (Some(_), Some(_), None) => return Err(VaultError::Conflict),
                        (None, None, Some(bytes)) if hash(bytes) == entry.new_hash => {
                            if staged_bytes.is_some() {
                                return Err(VaultError::Unavailable);
                            }
                            actions.push(RecoveryAction::Remove {
                                path: entry.path.clone(),
                                expected_current_hash: entry.new_hash.clone(),
                            });
                        }
                        (None, None, None) => {
                            // The absent target is already in the chosen rollback state. Missing
                            // staging is safe after an interrupted cleanup and remains idempotent.
                        }
                        _ => return Err(VaultError::Conflict),
                    }
                }
            }
        }

        // Mutation pass: it is reached only after every entry and payload has passed preflight.
        for action in actions {
            match action {
                RecoveryAction::Restore {
                    path,
                    previous,
                    expected_current_hash,
                } => {
                    let parent = open_parent(&self.root, &path, false)?;
                    Self::require_expected_hash(
                        &parent.directory,
                        &parent.basename,
                        &expected_current_hash,
                    )?;
                    self.publish_bytes_locked(&path, &previous)?;
                }
                RecoveryAction::Remove {
                    path,
                    expected_current_hash,
                } => {
                    let parent = open_parent(&self.root, &path, false)?;
                    Self::require_expected_hash(
                        &parent.directory,
                        &parent.basename,
                        &expected_current_hash,
                    )?;
                    parent
                        .directory
                        .remove_file(&parent.basename)
                        .map_err(map_path_error)?;
                    sync_directory(&parent.directory)?;
                }
            }
        }
        if journal.phase == JournalPhase::Publishing
            && current_revision == journal.original_revision
        {
            self.write_internal_locked(
                VAULT_REVISION_PATH,
                journal.reserved_revision.to_string().as_bytes(),
            )?;
        }
        self.cleanup_staged_temps_locked(journal)?;
        self.cleanup_batch_journal_locked()
    }

    fn recover_pending_locked(&self) -> Result<(), VaultError> {
        let metadata = match self.root.symlink_metadata(BATCH_JOURNAL_PATH) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(map_path_error(error)),
        };
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(VaultError::Unavailable);
        }
        let directory = self
            .root
            .open_dir_nofollow(BATCH_JOURNAL_PATH)
            .map_err(map_path_error)?;
        match directory.symlink_metadata(BATCH_JOURNAL_MANIFEST) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return self.cleanup_batch_journal_locked();
            }
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {}
            Ok(_) => return Err(VaultError::Unavailable),
            Err(error) => return Err(map_path_error(error)),
        }
        // A malformed journal may describe a transaction that already published one or more
        // targets. Preserve it as forensic/recovery evidence and keep the vault unavailable.
        let journal = self.read_journal_locked()?;
        let Some((directory, journal)) = journal else {
            return Ok(());
        };
        self.recover_journal_locked(&directory, &journal)
    }

    fn recover_batch(&self) -> Result<(), VaultError> {
        let _write_guard = self.lock_writes()?;
        self.recover_pending_locked()
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
        self.recover_pending_locked()?;
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
        self.read_binary_bounded(path, MAX_PORTABLE_ENTRY_BYTES)
    }

    fn read_binary_bounded(&self, path: &str, maximum: u64) -> Result<Vec<u8>, VaultError> {
        if maximum > MAX_PORTABLE_ENTRY_BYTES {
            return Err(VaultError::Unavailable);
        }
        let _write_guard = self.lock_writes()?;
        self.recover_pending_locked()?;
        self.read_binary_bounded_unlocked(path, maximum)
    }

    fn read_binary_bounded_unlocked(
        &self,
        path: &str,
        maximum: u64,
    ) -> Result<Vec<u8>, VaultError> {
        let parent = open_parent(&self.root, path, false)?;
        read_file_nofollow_bounded(
            &parent.directory,
            &parent.basename,
            usize::try_from(maximum).map_err(|_| VaultError::Unavailable)?,
        )
    }

    fn read_binary_chunk(
        &self,
        path: &str,
        offset: u64,
        length: u32,
    ) -> Result<Vec<u8>, VaultError> {
        let length = usize::try_from(length).map_err(|_| VaultError::Unavailable)?;
        if length == 0 || length > MAX_BINARY_CHUNK_BYTES {
            return Err(VaultError::Unavailable);
        }
        let _write_guard = self.lock_writes()?;
        self.recover_pending_locked()?;
        let parent = open_parent(&self.root, path, false)?;
        let mut file = open_file_nofollow(&parent.directory, &parent.basename)?;
        let size = file.metadata().map_err(|_| VaultError::Unavailable)?.len();
        if offset >= size {
            return Ok(Vec::new());
        }
        let available = usize::try_from((size - offset).min(length as u64))
            .map_err(|_| VaultError::Unavailable)?;
        file.seek(SeekFrom::Start(offset))
            .map_err(|_| VaultError::Unavailable)?;
        let mut bytes = vec![0; available];
        file.read_exact(&mut bytes)
            .map_err(|_| VaultError::Unavailable)?;
        Ok(bytes)
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
        self.recover_pending_locked()?;
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
        crash_point: Option<BatchCrashPoint>,
    ) -> Result<AtomicBatchResult, VaultError> {
        if batch.writes.is_empty() || batch.writes.len() > MAX_BATCH_WRITES {
            return Err(VaultError::Unavailable);
        }
        let new_bytes = batch.writes.iter().try_fold(0usize, |total, write| {
            total
                .checked_add(write.bytes.len())
                .filter(|value| *value <= MAX_BATCH_BYTES)
                .ok_or(VaultError::Unavailable)
        })?;
        let _write_guard = self.lock_writes()?;
        self.recover_pending_locked()?;
        if self.revision_locked()? != batch.expected_revision {
            return Err(VaultError::Conflict);
        }
        self.require_user_state(batch.expected_user_state.as_deref())?;
        let mut seen = HashSet::with_capacity(batch.writes.len());
        let mut prepared: Vec<PreparedWrite> = Vec::with_capacity(batch.writes.len());
        let mut previous_bytes = 0usize;
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
                        Some(read_file_nofollow_bounded(
                            &parent.directory,
                            &parent.basename,
                            MAX_BATCH_BYTES.saturating_sub(previous_bytes),
                        )?)
                    }
                    Ok(_) => return Err(VaultError::PathEscape),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                    Err(error) => return Err(map_path_error(error)),
                };
                Ok(PreparedWrite {
                    path: write.path,
                    temporary: format!(".studio-{}.tmp", Uuid::new_v4().simple()),
                    previous,
                    expected_hash: write.expected_hash,
                    expected_missing: write.expected_missing,
                    hash: hash(&write.bytes),
                    bytes: write.bytes,
                })
            })();
            match prepare_result {
                Ok(write) => {
                    previous_bytes += write.previous.as_ref().map_or(0, Vec::len);
                    prepared.push(write);
                }
                Err(error) => {
                    return Err(error);
                }
            }
        }

        previous_bytes
            .checked_mul(2)
            .and_then(|total| total.checked_add(new_bytes))
            .filter(|total| *total <= MAX_BATCH_BYTES)
            .ok_or(VaultError::Unavailable)?;

        self.require_user_state(batch.expected_user_state.as_deref())?;
        let reserved_revision = batch
            .expected_revision
            .checked_add(1)
            .ok_or(VaultError::Unavailable)?;
        let mut journal = BatchJournal {
            version: 1,
            original_revision: batch.expected_revision,
            reserved_revision,
            phase: JournalPhase::Preparing,
            progress: 0,
            entries: prepared
                .iter()
                .enumerate()
                .map(|(index, write)| BatchJournalEntry {
                    path: write.path.clone(),
                    temporary: write.temporary.clone(),
                    previous_backup: write
                        .previous
                        .as_ref()
                        .map(|_| format!("previous-{index}.bin")),
                    previous_hash: write.previous.as_ref().map(|bytes| hash(bytes)),
                    new_hash: write.hash.clone(),
                })
                .collect(),
        };
        self.root
            .create_dir(BATCH_JOURNAL_PATH)
            .map_err(map_path_error)?;
        sync_directory(&self.root)?;
        let journal_directory = self
            .root
            .open_dir_nofollow(BATCH_JOURNAL_PATH)
            .map_err(map_path_error)?;
        if let Err(error) = self.write_journal_manifest_locked(&journal_directory, &journal) {
            let _ = self.cleanup_batch_journal_locked();
            return Err(error);
        }
        if crash_point == Some(BatchCrashPoint::PreparedManifest) {
            return Err(VaultError::Unavailable);
        }

        let stage_result = (|| {
            let mut backup_bytes = 0usize;
            for (index, write) in prepared.iter().enumerate() {
                let parent = open_parent(&self.root, &write.path, true)?;
                Self::write_synced_file(&parent.directory, &write.temporary, &write.bytes)?;
                sync_directory(&parent.directory)?;
                if let Some(previous) = &write.previous {
                    backup_bytes = backup_bytes
                        .checked_add(previous.len())
                        .ok_or(VaultError::Unavailable)?;
                    if backup_bytes > MAX_BATCH_BYTES {
                        return Err(VaultError::Unavailable);
                    }
                    Self::write_synced_file(
                        &journal_directory,
                        &format!("previous-{index}.bin"),
                        previous,
                    )?;
                }
            }
            sync_directory(&journal_directory)
        })();
        if let Err(error) = stage_result {
            let _ = self.cleanup_staged_temps_locked(&journal);
            let _ = self.cleanup_batch_journal_locked();
            return Err(error);
        }
        if crash_point == Some(BatchCrashPoint::StagedData) {
            return Err(VaultError::Unavailable);
        }
        let conditions = (|| {
            for write in &prepared {
                let parent = open_parent(&self.root, &write.path, true)?;
                Self::require_write_condition(
                    &parent.directory,
                    &parent.basename,
                    write.expected_hash.as_deref(),
                    write.expected_missing,
                )?;
            }
            self.require_user_state(batch.expected_user_state.as_deref())
        })();
        if let Err(error) = conditions {
            let _ = self.cleanup_staged_temps_locked(&journal);
            let _ = self.cleanup_batch_journal_locked();
            return Err(error);
        }
        journal.phase = JournalPhase::Publishing;
        if let Err(error) = self.write_journal_manifest_locked(&journal_directory, &journal) {
            let _ = self.cleanup_staged_temps_locked(&journal);
            let _ = self.cleanup_batch_journal_locked();
            return Err(error);
        }
        if crash_point == Some(BatchCrashPoint::PublishingManifest) {
            return Err(VaultError::Unavailable);
        }
        let revision = match self.reserve_revision_locked() {
            Ok(revision) if revision == reserved_revision => revision,
            Ok(_) => return Err(VaultError::Unavailable),
            Err(error) => {
                let _ = self.recover_journal_locked(&journal_directory, &journal);
                return Err(error);
            }
        };
        if crash_point == Some(BatchCrashPoint::RevisionReserved) {
            return Err(VaultError::Unavailable);
        }

        enum PublicationFailure {
            Runtime(VaultError),
            Crash,
        }
        let publish_result: Result<(), PublicationFailure> = (|| {
            for (index, write) in prepared.iter().enumerate() {
                if fail_before_publication == Some(index) {
                    return Err(PublicationFailure::Runtime(VaultError::Unavailable));
                }
                let parent = open_parent(&self.root, &write.path, true)
                    .map_err(PublicationFailure::Runtime)?;
                Self::require_write_condition(
                    &parent.directory,
                    &parent.basename,
                    write.expected_hash.as_deref(),
                    write.expected_missing,
                )
                .map_err(PublicationFailure::Runtime)?;
                if write.expected_missing {
                    rename_exclusive(
                        &parent.directory,
                        &write.temporary,
                        &parent.directory,
                        &parent.basename,
                    )
                    .map_err(PublicationFailure::Runtime)?;
                } else {
                    parent
                        .directory
                        .rename(&write.temporary, &parent.directory, &parent.basename)
                        .map_err(map_path_error)
                        .map_err(PublicationFailure::Runtime)?;
                }
                sync_directory(&parent.directory).map_err(PublicationFailure::Runtime)?;
                if crash_point == Some(BatchCrashPoint::Published(index)) {
                    return Err(PublicationFailure::Crash);
                }
                if let Some(callback) = after_publication {
                    callback(index);
                }
                journal.progress = index + 1;
                self.write_journal_manifest_locked(&journal_directory, &journal)
                    .map_err(PublicationFailure::Runtime)?;
                if crash_point == Some(BatchCrashPoint::ProgressPersisted(index)) {
                    return Err(PublicationFailure::Crash);
                }
            }
            Ok(())
        })();
        match publish_result {
            Ok(()) => {}
            Err(PublicationFailure::Crash) => return Err(VaultError::Unavailable),
            Err(PublicationFailure::Runtime(error)) => {
                return match self.recover_journal_locked(&journal_directory, &journal) {
                    Ok(()) => Err(error),
                    Err(_) => Err(VaultError::Unavailable),
                };
            }
        }

        journal.phase = JournalPhase::Committed;
        journal.progress = journal.entries.len();
        if let Err(error) = self.write_journal_manifest_locked(&journal_directory, &journal) {
            return match self.recover_journal_locked(&journal_directory, &journal) {
                Ok(()) => Err(error),
                Err(_) => Err(VaultError::Unavailable),
            };
        }
        if crash_point == Some(BatchCrashPoint::CommittedManifest) {
            return Err(VaultError::Unavailable);
        }
        self.cleanup_batch_journal_locked()?;
        if crash_point == Some(BatchCrashPoint::JournalRemoved) {
            return Err(VaultError::Unavailable);
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
        self.write_batch_atomic_inner(batch, None, None, None)
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
        self.recover_pending_locked()?;
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
        self.recover_pending_locked()?;
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
        self.recover_pending_locked()?;
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
        self.recover_pending_locked()?;
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
        self.recover_pending_locked()?;
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
    pub fn read_binary_chunk_for_test(
        &self,
        path: &str,
        offset: u64,
        length: u32,
    ) -> Result<Vec<u8>, VaultError> {
        self.read_binary_chunk(path, offset, length)
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
    let mut file = open_file_nofollow(directory, basename)?;
    let stat_size = file.metadata().map_err(|_| VaultError::Unavailable)?.len();
    let (size, content_hash) = stream_file_hash(&mut file)?;
    if size != stat_size {
        return Err(VaultError::Unavailable);
    }
    entries.push(VaultEntry {
        path: path.to_owned(),
        kind: "file",
        size: Some(size),
        modified_at: None,
        content_hash: Some(content_hash),
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
pub fn vault_read_binary_bounded<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    path: String,
    max_bytes: u64,
) -> Result<Response, VaultError> {
    Ok(Response::new(
        selected_vault(&window, &state, &vault_token)?.read_binary_bounded(&path, max_bytes)?,
    ))
}

#[tauri::command]
pub fn vault_read_binary_chunk<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, VaultRegistry>,
    vault_token: String,
    path: String,
    offset: u64,
    length: u32,
) -> Result<Response, VaultError> {
    Ok(Response::new(
        selected_vault(&window, &state, &vault_token)?.read_binary_chunk(&path, offset, length)?,
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

    #[test]
    fn studio_folder_name_is_trimmed_and_whitespace_is_normalized() {
        assert_eq!(normalize_studio_folder_name("  My\t Calm   Studio  ").unwrap(), "My Calm Studio");
    }

    #[test]
    fn studio_folder_name_rejects_traversal_and_unsafe_components() {
        for name in ["", "   ", ".", "..", "../Elsewhere", "Nested/Studio", "Nested\\Studio", "bad\0name"] {
            assert_eq!(normalize_studio_folder_name(name), Err(VaultError::PathEscape));
        }
    }

    #[test]
    fn creating_a_studio_uses_a_new_named_child_and_never_opens_a_collision() {
        let parent = tempfile::tempdir().unwrap();
        let registry = VaultRegistry::default();

        let selection = registry
            .create_in_selected_parent("main", parent.path(), "  My   Studio ")
            .unwrap();
        let studio_path = parent.path().join("My Studio");
        assert!(studio_path.is_dir());
        assert_eq!(registry.capability_count_for_test(), 1);
        assert_eq!(
            selection.recovery_identity,
            registry
                .vault_for_test("main", &selection.vault_token)
                .unwrap()
                .recovery_identity()
                .unwrap()
        );

        assert_eq!(
            registry.create_in_selected_parent("other", parent.path(), "My Studio"),
            Err(VaultError::Conflict)
        );
        assert_eq!(registry.capability_count_for_test(), 1);
    }

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

    fn crash_test_batch(expected_revision: u64) -> AtomicBatch {
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
                    bytes: b"new".to_vec(),
                    expected_hash: None,
                    expected_missing: true,
                },
            ],
        }
    }

    fn two_existing_files_batch(expected_revision: u64) -> AtomicBatch {
        AtomicBatch {
            expected_revision,
            expected_user_state: None,
            writes: vec![
                AtomicBatchWrite {
                    path: "first.md".into(),
                    bytes: b"after-first".to_vec(),
                    expected_hash: Some(hash(b"before-first")),
                    expected_missing: false,
                },
                AtomicBatchWrite {
                    path: "second.md".into(),
                    bytes: b"after-second".to_vec(),
                    expected_hash: Some(hash(b"before-second")),
                    expected_missing: false,
                },
            ],
        }
    }

    fn assert_no_transaction_leaks(path: &Path) {
        fn walk(path: &Path, leaks: &mut Vec<String>) {
            for entry in std::fs::read_dir(path).unwrap() {
                let entry = entry.unwrap();
                let name = entry.file_name().to_string_lossy().into_owned();
                if name == BATCH_JOURNAL_PATH
                    || (name.starts_with(".studio-") && name.ends_with(".tmp"))
                {
                    leaks.push(entry.path().display().to_string());
                }
                if entry.file_type().unwrap().is_dir() {
                    walk(&entry.path(), leaks);
                }
            }
        }
        let mut leaks = Vec::new();
        walk(path, &mut leaks);
        assert!(leaks.is_empty(), "transaction leaks: {leaks:?}");
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
    fn listing_streams_large_hashes_and_raw_reads_enforce_the_exact_zip32_boundary() {
        let (directory, vault) = selected_vault();
        let oversized_path = directory.path().join("oversized.bin");
        let oversized_size = MAX_PORTABLE_ENTRY_BYTES + 1;
        std::fs::File::create(&oversized_path)
            .unwrap()
            .set_len(oversized_size)
            .unwrap();
        let mut expected = Sha256::new();
        let zeroes = [0_u8; 64 * 1024];
        let mut remaining = oversized_size;
        while remaining > 0 {
            let length = usize::try_from(remaining.min(zeroes.len() as u64)).unwrap();
            expected.update(&zeroes[..length]);
            remaining -= length as u64;
        }

        let entry = vault
            .list(None)
            .unwrap()
            .into_iter()
            .find(|entry| entry.path == "oversized.bin")
            .unwrap();
        assert_eq!(entry.size, Some(oversized_size));
        assert_eq!(entry.content_hash, Some(hex::encode(expected.finalize())));
        assert!(matches!(
            vault.read_binary("oversized.bin"),
            Err(VaultError::Unavailable)
        ));

        std::fs::remove_file(oversized_path).unwrap();
        std::fs::File::create(directory.path().join("boundary.bin"))
            .unwrap()
            .set_len(MAX_PORTABLE_ENTRY_BYTES)
            .unwrap();
        let bytes = vault.read_binary("boundary.bin").unwrap();
        assert_eq!(bytes.len() as u64, MAX_PORTABLE_ENTRY_BYTES);
        assert_eq!(bytes.first(), Some(&0));
        assert_eq!(bytes.last(), Some(&0));
    }

    #[test]
    fn ordinary_large_attachment_reads_in_exact_bounded_chunks() {
        let (directory, vault) = selected_vault();
        let size = usize::try_from(MAX_PORTABLE_ENTRY_BYTES).unwrap() + 17;
        let expected = (0..size)
            .map(|index| ((index * 31 + 7) % 251) as u8)
            .collect::<Vec<_>>();
        std::fs::create_dir(directory.path().join("Attachments")).unwrap();
        std::fs::write(directory.path().join("Attachments/large.bin"), &expected).unwrap();

        let mut actual = Vec::with_capacity(size);
        let mut offset = 0_u64;
        loop {
            let chunk = vault
                .read_binary_chunk_for_test(
                    "Attachments/large.bin",
                    offset,
                    u32::try_from(MAX_BINARY_CHUNK_BYTES).unwrap(),
                )
                .unwrap();
            assert!(chunk.len() <= MAX_BINARY_CHUNK_BYTES);
            if chunk.is_empty() {
                break;
            }
            offset += chunk.len() as u64;
            actual.extend_from_slice(&chunk);
        }

        assert_eq!(actual, expected);
        assert!(matches!(
            vault.read_binary("Attachments/large.bin"),
            Err(VaultError::Unavailable)
        ));
        assert!(matches!(
            vault.read_binary_chunk_for_test("../outside.bin", 0, 1),
            Err(VaultError::PathEscape)
        ));
        assert!(matches!(
            vault.read_binary_chunk_for_test(
                "Attachments/large.bin",
                0,
                u32::try_from(MAX_BINARY_CHUNK_BYTES + 1).unwrap(),
            ),
            Err(VaultError::Unavailable)
        ));
    }

    #[test]
    fn raw_read_rejects_growth_after_stat_without_allocating_past_the_limit() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("growing.bin");
        std::fs::write(&path, vec![7; 32]).unwrap();
        let root = Dir::open_ambient_dir(directory.path(), ambient_authority()).unwrap();
        let file = open_file_nofollow(&root, "growing.bin").unwrap();

        let result = read_exact_bounded_after_stat(file, 32, || {
            let mut growing = std::fs::OpenOptions::new()
                .append(true)
                .open(&path)
                .unwrap();
            growing.write_all(&[8]).unwrap();
            growing.sync_all().unwrap();
        });

        assert!(matches!(result, Err(VaultError::Unavailable)));
    }

    #[test]
    fn retained_recovery_budget_rejects_growth_after_aggregate_preflight() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("first.bin"), b"12345678").unwrap();
        std::fs::write(directory.path().join("second.bin"), b"abcdefgh").unwrap();
        let root = Dir::open_ambient_dir(directory.path(), ambient_authority()).unwrap();
        let mut retained = 0usize;

        let first =
            read_recovery_payload_after_stat(&root, "first.bin", &mut retained, 16, || {}).unwrap();
        assert_eq!(first, b"12345678");
        let result =
            read_recovery_payload_after_stat(&root, "second.bin", &mut retained, 16, || {
                let file = std::fs::OpenOptions::new()
                    .append(true)
                    .open(directory.path().join("second.bin"))
                    .unwrap();
                file.set_len(9).unwrap();
            });

        assert!(matches!(result, Err(VaultError::Unavailable)));
        assert_eq!(retained, 8);
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
    fn restart_recovery_exposes_only_all_old_or_all_new_at_every_boundary() {
        let points = [
            (BatchCrashPoint::PreparedManifest, false, false),
            (BatchCrashPoint::StagedData, false, false),
            (BatchCrashPoint::PublishingManifest, false, true),
            (BatchCrashPoint::RevisionReserved, false, true),
            (BatchCrashPoint::Published(0), false, true),
            (BatchCrashPoint::ProgressPersisted(0), false, true),
            (BatchCrashPoint::Published(1), false, true),
            (BatchCrashPoint::ProgressPersisted(1), false, true),
            (BatchCrashPoint::CommittedManifest, true, true),
            (BatchCrashPoint::JournalRemoved, true, true),
        ];
        for (point, expect_new, expect_reserved_revision) in points {
            let (directory, vault) = selected_vault();
            vault
                .write_text_atomic("first.md", "before", None, false, None)
                .unwrap();
            let original_revision = parse_revision(&vault.get_revision().unwrap()).unwrap();
            assert!(matches!(
                vault.write_batch_atomic_inner(
                    crash_test_batch(original_revision),
                    None,
                    None,
                    Some(point),
                ),
                Err(VaultError::Unavailable)
            ));
            drop(vault);

            let reopened = VaultRegistry::default();
            let selection = reopened
                .register_selected_path("reopen", directory.path())
                .unwrap();
            let recovered = reopened.vault("reopen", &selection.vault_token).unwrap();
            assert_eq!(
                recovered.read_binary("first.md").unwrap(),
                if expect_new {
                    b"after".as_slice()
                } else {
                    b"before".as_slice()
                },
                "crash point {point:?}"
            );
            assert_eq!(
                recovered.exists("second.bin").unwrap(),
                expect_new,
                "crash point {point:?}"
            );
            assert_eq!(
                parse_revision(&recovered.get_revision().unwrap()).unwrap(),
                original_revision + u64::from(expect_reserved_revision),
                "crash point {point:?}"
            );
            drop(recovered);
            drop(reopened);

            let reopened_again = VaultRegistry::default();
            let second_selection = reopened_again
                .register_selected_path("again", directory.path())
                .unwrap();
            let second_recovery = reopened_again
                .vault("again", &second_selection.vault_token)
                .unwrap();
            assert_eq!(
                second_recovery.read_binary("first.md").unwrap(),
                if expect_new {
                    b"after".as_slice()
                } else {
                    b"before".as_slice()
                }
            );
            assert_eq!(second_recovery.exists("second.bin").unwrap(), expect_new);
            assert_eq!(
                parse_revision(&second_recovery.get_revision().unwrap()).unwrap(),
                original_revision + u64::from(expect_reserved_revision)
            );
            assert_no_transaction_leaks(directory.path());
        }
    }

    #[test]
    fn forged_and_oversized_journals_are_rejected_without_destroying_evidence() {
        for manifest in [
            serde_json::json!({
                "version": 1,
                "original_revision": 0,
                "reserved_revision": 1,
                "phase": "publishing",
                "progress": 0,
                "entries": [{
                    "path": "../outside.md",
                    "temporary": ".studio-forged.tmp",
                    "previous_backup": null,
                    "previous_hash": null,
                    "new_hash": "a".repeat(64),
                }]
            })
            .to_string()
            .into_bytes(),
            vec![b'x'; MAX_JOURNAL_MANIFEST_BYTES + 1],
        ] {
            let directory = tempfile::tempdir().unwrap();
            let initial = VaultRegistry::default();
            initial
                .register_selected_path("initial", directory.path())
                .unwrap();
            drop(initial);
            let journal = directory.path().join(BATCH_JOURNAL_PATH);
            std::fs::create_dir(&journal).unwrap();
            std::fs::write(journal.join(BATCH_JOURNAL_MANIFEST), manifest).unwrap();

            assert!(matches!(
                VaultRegistry::default().register_selected_path("forged", directory.path()),
                Err(VaultError::Unavailable | VaultError::PathEscape)
            ));
            assert!(journal.exists());
        }
    }

    #[test]
    fn later_corrupt_backup_causes_zero_recovery_mutations_and_stays_fail_closed() {
        let directory = tempfile::tempdir().unwrap();
        let registry = VaultRegistry::default();
        let selection = registry
            .register_selected_path("initial", directory.path())
            .unwrap();
        let vault = registry.vault("initial", &selection.vault_token).unwrap();
        vault
            .write_text_atomic("first.md", "before-first", None, false, None)
            .unwrap();
        vault
            .write_text_atomic("second.md", "before-second", None, false, None)
            .unwrap();
        let revision = parse_revision(&vault.get_revision().unwrap()).unwrap();
        assert!(
            vault
                .write_batch_atomic_inner(
                    two_existing_files_batch(revision),
                    None,
                    None,
                    Some(BatchCrashPoint::Published(1)),
                )
                .is_err()
        );
        drop(vault);
        drop(registry);
        let journal = directory.path().join(BATCH_JOURNAL_PATH);
        std::fs::write(journal.join("previous-0.bin"), b"corrupt").unwrap();

        for owner in ["first-open", "second-open"] {
            assert!(matches!(
                VaultRegistry::default().register_selected_path(owner, directory.path()),
                Err(VaultError::Unavailable | VaultError::Conflict)
            ));
            assert_eq!(
                std::fs::read(directory.path().join("first.md")).unwrap(),
                b"after-first"
            );
            assert_eq!(
                std::fs::read(directory.path().join("second.md")).unwrap(),
                b"after-second"
            );
            assert!(journal.exists());
        }
    }

    #[test]
    fn later_external_edit_or_missing_prior_file_causes_zero_recovery_mutations() {
        for remove_second in [false, true] {
            let directory = tempfile::tempdir().unwrap();
            let registry = VaultRegistry::default();
            let selection = registry
                .register_selected_path("initial", directory.path())
                .unwrap();
            let vault = registry.vault("initial", &selection.vault_token).unwrap();
            vault
                .write_text_atomic("first.md", "before-first", None, false, None)
                .unwrap();
            vault
                .write_text_atomic("second.md", "before-second", None, false, None)
                .unwrap();
            let revision = parse_revision(&vault.get_revision().unwrap()).unwrap();
            assert!(
                vault
                    .write_batch_atomic_inner(
                        two_existing_files_batch(revision),
                        None,
                        None,
                        Some(BatchCrashPoint::Published(1)),
                    )
                    .is_err()
            );
            drop(vault);
            drop(registry);
            if remove_second {
                std::fs::remove_file(directory.path().join("first.md")).unwrap();
            } else {
                std::fs::write(directory.path().join("first.md"), b"external").unwrap();
            }

            for owner in ["first-open", "second-open"] {
                assert!(matches!(
                    VaultRegistry::default().register_selected_path(owner, directory.path()),
                    Err(VaultError::Unavailable | VaultError::Conflict)
                ));
                if remove_second {
                    assert!(!directory.path().join("first.md").exists());
                } else {
                    assert_eq!(
                        std::fs::read(directory.path().join("first.md")).unwrap(),
                        b"external"
                    );
                }
                assert_eq!(
                    std::fs::read(directory.path().join("second.md")).unwrap(),
                    b"after-second"
                );
                assert!(directory.path().join(BATCH_JOURNAL_PATH).exists());
            }
        }
    }

    #[test]
    fn ordinary_operations_fail_closed_until_a_surviving_journal_recovers() {
        let (directory, vault) = selected_vault();
        vault
            .write_text_atomic("first.md", "before", None, false, None)
            .unwrap();
        let revision = parse_revision(&vault.get_revision().unwrap()).unwrap();
        assert!(
            vault
                .write_batch_atomic_inner(
                    crash_test_batch(revision),
                    None,
                    None,
                    Some(BatchCrashPoint::Published(0)),
                )
                .is_err()
        );

        assert_eq!(vault.read_binary("first.md").unwrap(), b"before");
        assert!(!vault.exists("second.bin").unwrap());
        assert_no_transaction_leaks(directory.path());
    }

    #[test]
    fn ordinary_operations_never_bypass_an_unrecoverable_journal() {
        let (directory, vault) = selected_vault();
        vault
            .write_text_atomic("first.md", "before-first", None, false, None)
            .unwrap();
        vault
            .write_text_atomic("second.md", "before-second", None, false, None)
            .unwrap();
        let revision = parse_revision(&vault.get_revision().unwrap()).unwrap();
        assert!(
            vault
                .write_batch_atomic_inner(
                    two_existing_files_batch(revision),
                    None,
                    None,
                    Some(BatchCrashPoint::Published(1)),
                )
                .is_err()
        );
        let journal = directory.path().join(BATCH_JOURNAL_PATH);
        std::fs::write(journal.join("previous-0.bin"), b"corrupt").unwrap();

        assert!(vault.read_binary("first.md").is_err());
        assert!(vault.read_text("first.md").is_err());
        assert!(vault.list(None).is_err());
        assert!(vault.snapshot().is_err());
        assert!(vault.exists("first.md").is_err());
        assert!(vault.get_revision().is_err());
        assert!(
            vault
                .write_text_atomic("third.md", "unsafe", None, true, None)
                .is_err()
        );
        assert!(vault.move_path("first.md", "moved.md", None, None).is_err());
        assert!(vault.remove("first.md", None, false, None).is_err());

        assert_eq!(
            std::fs::read(directory.path().join("first.md")).unwrap(),
            b"after-first"
        );
        assert_eq!(
            std::fs::read(directory.path().join("second.md")).unwrap(),
            b"after-second"
        );
        assert!(!directory.path().join("third.md").exists());
        assert!(!directory.path().join("moved.md").exists());
        assert!(journal.exists());
    }

    #[test]
    fn rollback_recovery_tolerates_a_crash_after_staged_cleanup() {
        let (directory, vault) = selected_vault();
        vault
            .write_text_atomic("first.md", "before", None, false, None)
            .unwrap();
        let revision = parse_revision(&vault.get_revision().unwrap()).unwrap();
        assert!(
            vault
                .write_batch_atomic_inner(
                    crash_test_batch(revision),
                    None,
                    None,
                    Some(BatchCrashPoint::Published(0)),
                )
                .is_err()
        );
        drop(vault);

        let manifest: BatchJournal = serde_json::from_slice(
            &std::fs::read(
                directory
                    .path()
                    .join(BATCH_JOURNAL_PATH)
                    .join(BATCH_JOURNAL_MANIFEST),
            )
            .unwrap(),
        )
        .unwrap();
        let unpublished = &manifest.entries[1];
        std::fs::remove_file(directory.path().join(&unpublished.temporary)).unwrap();

        let reopened = VaultRegistry::default();
        let selection = reopened
            .register_selected_path("recover-cleanup", directory.path())
            .unwrap();
        let recovered = reopened
            .vault("recover-cleanup", &selection.vault_token)
            .unwrap();
        assert_eq!(recovered.read_binary("first.md").unwrap(), b"before");
        assert!(!recovered.exists("second.bin").unwrap());
        assert_no_transaction_leaks(directory.path());
    }

    #[test]
    fn retired_manifest_makes_interrupted_journal_cleanup_recoverable() {
        let (directory, vault) = selected_vault();
        let journal = directory.path().join(BATCH_JOURNAL_PATH);
        std::fs::create_dir(&journal).unwrap();
        std::fs::write(journal.join(BATCH_JOURNAL_MANIFEST), b"{}").unwrap();
        std::fs::write(journal.join("previous-0.bin"), b"evidence").unwrap();

        let journal_directory = vault.root.open_dir_nofollow(BATCH_JOURNAL_PATH).unwrap();
        vault
            .retire_batch_journal_manifest_locked(&journal_directory)
            .unwrap();
        drop(vault);

        let reopened = VaultRegistry::default();
        reopened
            .register_selected_path("cleanup-restart", directory.path())
            .unwrap();
        assert!(!journal.exists());
    }

    #[test]
    fn orphaned_native_journal_without_a_manifest_is_removed_before_open() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::create_dir(directory.path().join(BATCH_JOURNAL_PATH)).unwrap();

        let registry = VaultRegistry::default();
        registry
            .register_selected_path("orphan", directory.path())
            .unwrap();

        assert!(!directory.path().join(BATCH_JOURNAL_PATH).exists());
    }

    #[test]
    fn aggregate_recovery_budget_rejects_forged_valid_files_without_mutation() {
        let directory = tempfile::tempdir().unwrap();
        let initial = VaultRegistry::default();
        let selection = initial
            .register_selected_path("initial", directory.path())
            .unwrap();
        let vault = initial.vault("initial", &selection.vault_token).unwrap();
        let revision = parse_revision(&vault.get_revision().unwrap()).unwrap();
        drop(vault);
        drop(initial);

        let each = (MAX_BATCH_BYTES / 2 + 1) as u64;
        for name in ["first.bin", "second.bin"] {
            std::fs::File::create(directory.path().join(name))
                .unwrap()
                .set_len(each)
                .unwrap();
        }
        let journal_path = directory.path().join(BATCH_JOURNAL_PATH);
        std::fs::create_dir(&journal_path).unwrap();
        let entries = ["first.bin", "second.bin"]
            .into_iter()
            .enumerate()
            .map(|(index, path)| BatchJournalEntry {
                path: path.to_owned(),
                temporary: format!(".studio-forged-{index}.tmp"),
                previous_backup: Some(format!("previous-{index}.bin")),
                previous_hash: Some("a".repeat(64)),
                new_hash: "b".repeat(64),
            })
            .collect();
        let journal = BatchJournal {
            version: 1,
            original_revision: revision,
            reserved_revision: revision + 1,
            phase: JournalPhase::Preparing,
            progress: 0,
            entries,
        };
        std::fs::write(
            journal_path.join(BATCH_JOURNAL_MANIFEST),
            serde_json::to_vec(&journal).unwrap(),
        )
        .unwrap();

        assert!(matches!(
            VaultRegistry::default().register_selected_path("oversized", directory.path()),
            Err(VaultError::Unavailable)
        ));
        for name in ["first.bin", "second.bin"] {
            assert_eq!(
                std::fs::metadata(directory.path().join(name))
                    .unwrap()
                    .len(),
                each
            );
        }
        assert!(journal_path.exists());
    }

    #[test]
    fn journal_control_files_never_appear_in_public_list_or_watch_snapshots() {
        let (directory, vault) = selected_vault();
        vault
            .write_text_atomic("first.md", "before", None, false, None)
            .unwrap();
        let revision = parse_revision(&vault.get_revision().unwrap()).unwrap();
        assert!(
            vault
                .write_batch_atomic_inner(
                    crash_test_batch(revision),
                    None,
                    None,
                    Some(BatchCrashPoint::PreparedManifest),
                )
                .is_err()
        );
        assert!(directory.path().join(BATCH_JOURNAL_PATH).exists());

        assert!(
            vault
                .list(None)
                .unwrap()
                .iter()
                .all(|entry| !entry.path.starts_with(".studio-"))
        );
        assert!(
            vault
                .snapshot()
                .unwrap()
                .keys()
                .all(|path| !path.starts_with(".studio-"))
        );
        drop(vault);
        VaultRegistry::default()
            .register_selected_path("recover", directory.path())
            .unwrap();
        assert_no_transaction_leaks(directory.path());
    }

    #[test]
    fn atomic_batch_rolls_back_every_published_file_on_failure() {
        let (directory, vault) = selected_vault();
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
            None,
        );

        assert!(matches!(result, Err(VaultError::Unavailable)));
        assert_eq!(vault.read_binary("first.md").unwrap(), b"before");
        assert!(!vault.exists("second.bin").unwrap());
        assert!(parse_revision(&vault.get_revision().unwrap()).unwrap() > expected_revision);
        assert_no_transaction_leaks(directory.path());
    }

    #[test]
    fn atomic_batch_publishes_all_files_under_one_revision() {
        let (directory, vault) = selected_vault();
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
        assert_no_transaction_leaks(directory.path());
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
                None,
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
