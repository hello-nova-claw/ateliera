//! Portable Ateliera vault read/write core, exposed to Swift via UniFFI.
//!
//! The semantics are ported from
//! `apps/studio/src-tauri/src/commands/vault.rs` (path-guard, symlink-nofollow,
//! streaming SHA-256, sorted listing, `.studio-revision`). The single-note atomic
//! write mirrors that crate's `write_atomic`: an exclusive write lock, a temp file
//! created with `O_EXCL`, `sync_all`, a monotonic revision bump, and an atomic
//! rename (`RENAME_EXCL` when creating). ADR-012 records the plan to consolidate.

use std::ffi::CString;
use std::io::{Read, Write};
use std::os::unix::io::AsRawFd;
use std::path::{Component, Path};
use std::sync::{Arc, Mutex, MutexGuard};

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
    #[error("the write conflicts with the current vault state")]
    Conflict,
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

/// The outcome of a successful write: the new content's SHA-256 and the vault
/// revision the write advanced to (decimal string, matching `get_revision`).
#[derive(Debug, uniffi::Record)]
pub struct WriteOutcome {
    pub hash: String,
    pub revision: String,
}

/// A capability-scoped handle to a Studio vault folder. Opening is the only
/// ambient-authority boundary; later reads and writes never reopen the path.
#[derive(uniffi::Object)]
pub struct Vault {
    root: Dir,
    // Serialises writes in-process; paired with an OS advisory lock on
    // `.studio-write.lock` so a concurrent web/Tauri writer can't interleave.
    write_lock: Mutex<()>,
    write_lock_file: std::fs::File,
}

struct WriteGuard<'a> {
    _local: MutexGuard<'a, ()>,
    file: &'a std::fs::File,
}

impl Drop for WriteGuard<'_> {
    fn drop(&mut self) {
        // SAFETY: `file` stays open for the guard's lifetime; unlocking an
        // already-unlocked descriptor is harmless.
        let _ = unsafe { libc::flock(self.file.as_raw_fd(), libc::LOCK_UN) };
    }
}

#[uniffi::export]
impl Vault {
    /// Open a vault folder by absolute path. On iOS the caller must already hold
    /// security-scoped access to `path` (see the native picker).
    #[uniffi::constructor]
    pub fn open(path: String) -> Result<Arc<Self>, VaultError> {
        let root = Dir::open_ambient_dir(&path, ambient_authority())
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
        Ok(Arc::new(Vault {
            root,
            write_lock: Mutex::new(()),
            write_lock_file,
        }))
    }

    /// Atomically write a UTF-8 note. When `create_new` is true the path must not
    /// already exist (a fresh note); otherwise, if `expected_hash` is given the
    /// current file must match it (optimistic concurrency). Returns the new
    /// content hash and the revision the vault advanced to. Path-contained and
    /// symlink-refusing, like the read surface.
    pub fn write_text(
        &self,
        path: String,
        text: String,
        expected_hash: Option<String>,
        create_new: bool,
    ) -> Result<WriteOutcome, VaultError> {
        let bytes = text.into_bytes();
        let content_hash =
            self.write_atomic(&path, &bytes, expected_hash.as_deref(), create_new)?;
        Ok(WriteOutcome {
            hash: content_hash,
            revision: self.get_revision()?,
        })
    }

    /// List entries under `prefix` (or the whole vault), sorted by path, files
    /// carrying size + content hash. Internal `.studio-*` entries are hidden.
    pub fn list(&self, prefix: Option<String>) -> Result<Vec<VaultEntry>, VaultError> {
        let mut entries = Vec::new();
        match prefix.as_deref() {
            None | Some("") => collect_entries(&self.root, "", &mut entries)?,
            Some(prefix) => {
                validate_relative(prefix)?;
                let parent = open_parent(&self.root, prefix, false)?;
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
        let parent = open_parent(&self.root, &path, false)?;
        let bytes = read_file_nofollow(&parent.directory, &parent.basename)?;
        let text = String::from_utf8(bytes.clone()).map_err(|_| VaultError::Unavailable)?;
        Ok(ReadText {
            text,
            hash: hash(&bytes),
        })
    }

    /// Write arbitrary binary content (e.g. a cover image) through the same atomic,
    /// path-contained, symlink-refusing write path as `write_text`. Creating
    /// intermediate directories as needed (the `Media/` subfolder pattern).
    pub fn write_binary(
        &self,
        path: String,
        bytes: Vec<u8>,
        create_new: bool,
    ) -> Result<WriteOutcome, VaultError> {
        let content_hash = self.write_atomic(&path, &bytes, None, create_new)?;
        Ok(WriteOutcome {
            hash: content_hash,
            revision: self.get_revision()?,
        })
    }

    /// Read a file's raw bytes, refusing symlinks and traversal.
    pub fn read_binary(&self, path: String) -> Result<Vec<u8>, VaultError> {
        let parent = open_parent(&self.root, &path, false)?;
        read_file_nofollow(&parent.directory, &parent.basename)
    }

    /// Whether a path exists (false, not an error, for missing parents).
    pub fn exists(&self, path: String) -> Result<bool, VaultError> {
        let parent = match open_parent(&self.root, &path, false) {
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

    /// The monotonic vault revision as a decimal string (`"0"` when absent).
    /// Advanced by `write_text` on every successful write.
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

// Write internals, ported from the Tauri crate's `write_atomic` / revision
// helpers. Kept out of the `#[uniffi::export]` block since they are private.
impl Vault {
    fn write_atomic(
        &self,
        path: &str,
        bytes: &[u8],
        expected_hash: Option<&str>,
        expected_missing: bool,
    ) -> Result<String, VaultError> {
        let _write_guard = self.lock_writes()?;
        let parent = open_parent(&self.root, path, true)?;
        Self::require_write_condition(
            &parent.directory,
            &parent.basename,
            expected_hash,
            expected_missing,
        )?;
        let temporary = temp_name();
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
            // Re-check just before committing: the file could have appeared or
            // changed under us while the temp was being written.
            Self::require_write_condition(
                &parent.directory,
                &parent.basename,
                expected_hash,
                expected_missing,
            )?;
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

    fn lock_writes(&self) -> Result<WriteGuard<'_>, VaultError> {
        let local = self
            .write_lock
            .lock()
            .map_err(|_| VaultError::Unavailable)?;
        loop {
            // SAFETY: the lock descriptor is retained by `self`, and `WriteGuard`
            // releases the advisory lock after the in-process mutex.
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

    fn require_write_condition(
        directory: &Dir,
        basename: &str,
        expected_hash: Option<&str>,
        expected_missing: bool,
    ) -> Result<(), VaultError> {
        if expected_missing {
            match directory.symlink_metadata(basename) {
                Ok(_) => return Err(VaultError::Conflict),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(map_path_error(error)),
            }
        }
        if let Some(expected) = expected_hash {
            match read_file_nofollow(directory, basename) {
                Ok(bytes) if hash(&bytes) == expected => {}
                Err(VaultError::PathEscape) => return Err(VaultError::PathEscape),
                _ => return Err(VaultError::Conflict),
            }
        }
        Ok(())
    }

    /// Read the revision, bump it by one, and persist it atomically. The write
    /// lock must be held.
    fn reserve_revision_locked(&self) -> Result<u64, VaultError> {
        let next = self
            .revision_locked()?
            .checked_add(1)
            .ok_or(VaultError::Unavailable)?;
        self.write_internal_locked(REVISION_PATH, next.to_string().as_bytes())?;
        Ok(next)
    }

    fn revision_locked(&self) -> Result<u64, VaultError> {
        match self.root.symlink_metadata(REVISION_PATH) {
            Ok(metadata) => {
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err(VaultError::Unavailable);
                }
                let bytes = read_file_nofollow(&self.root, REVISION_PATH)?;
                let value = std::str::from_utf8(&bytes).map_err(|_| VaultError::Unavailable)?;
                parse_revision(value)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                self.write_internal_locked(REVISION_PATH, b"0")?;
                Ok(0)
            }
            Err(error) => Err(map_path_error(error)),
        }
    }

    /// Atomically write an internal `.studio-*` file at the vault root (temp +
    /// rename). The write lock must be held.
    fn write_internal_locked(&self, path: &str, bytes: &[u8]) -> Result<(), VaultError> {
        let temporary = temp_name();
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
}

fn parse_revision(value: &str) -> Result<u64, VaultError> {
    let value = value.trim();
    if value.is_empty()
        || (value.len() > 1 && value.starts_with('0'))
        || !value.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(VaultError::Conflict);
    }
    value.parse().map_err(|_| VaultError::Conflict)
}

fn sync_directory(directory: &Dir) -> Result<(), VaultError> {
    directory
        .try_clone()
        .and_then(|clone| clone.into_std_file().sync_all())
        .map_err(|_| VaultError::Unavailable)
}

// A collision-resistant temp name in the vault's internal namespace. Paired with
// `create_new` (O_EXCL) so any residual collision is a hard error, not a clobber.
fn temp_name() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    format!(".studio-{}-{}-{}.tmp", std::process::id(), counter, nanos)
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
unsafe extern "C" {
    fn renameatx_np(
        fromfd: libc::c_int,
        from: *const libc::c_char,
        tofd: libc::c_int,
        to: *const libc::c_char,
        flags: libc::c_uint,
    ) -> libc::c_int;
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn rename_exclusive(from_dir: &Dir, from: &str, to_dir: &Dir, to: &str) -> Result<(), VaultError> {
    const RENAME_EXCL: libc::c_uint = 0x0000_0004;
    let from_fd = from_dir
        .try_clone()
        .map_err(|_| VaultError::Unavailable)?
        .into_std_file();
    let to_fd = to_dir
        .try_clone()
        .map_err(|_| VaultError::Unavailable)?
        .into_std_file();
    let from = CString::new(from).map_err(|_| VaultError::PathEscape)?;
    let to = CString::new(to).map_err(|_| VaultError::PathEscape)?;
    // SAFETY: both directory descriptors and the NUL-terminated basename pointers
    // stay valid for the duration of this single syscall.
    let result = unsafe {
        renameatx_np(
            from_fd.as_raw_fd(),
            from.as_ptr(),
            to_fd.as_raw_fd(),
            to.as_ptr(),
            RENAME_EXCL,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        let error = std::io::Error::last_os_error();
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            Err(VaultError::Conflict)
        } else {
            Err(VaultError::Unavailable)
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn rename_exclusive(
    _from_dir: &Dir,
    _from: &str,
    _to_dir: &Dir,
    _to: &str,
) -> Result<(), VaultError> {
    Err(VaultError::Unavailable)
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
        || relative.split('/').any(|part| {
            part.is_empty() || part == "." || part == ".." || is_internal_component(part)
        })
        || Path::new(relative)
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(VaultError::PathEscape);
    }
    Ok(())
}

fn open_parent(root: &Dir, relative: &str, create: bool) -> Result<ParentHandle, VaultError> {
    validate_relative(relative)?;
    let mut parts = relative.split('/').peekable();
    let mut current = root.try_clone().map_err(|_| VaultError::Unavailable)?;
    let mut basename = None;
    while let Some(part) = parts.next() {
        if parts.peek().is_none() {
            basename = Some(part.to_owned());
            break;
        }
        match current.open_dir_nofollow(part) {
            Ok(next) => current = next,
            Err(error) if create && error.kind() == std::io::ErrorKind::NotFound => {
                current
                    .create_dir(part)
                    .or_else(|create_error| {
                        if create_error.kind() == std::io::ErrorKind::AlreadyExists {
                            Ok(())
                        } else {
                            Err(create_error)
                        }
                    })
                    .map_err(map_path_error)?;
                current = current.open_dir_nofollow(part).map_err(map_path_error)?;
            }
            Err(error) => return Err(map_path_error(error)),
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    // A throwaway vault directory under the OS temp dir. Removed on drop.
    struct TempVault {
        path: std::path::PathBuf,
        vault: Arc<Vault>,
    }

    impl TempVault {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("ateliera{}", temp_name()));
            std::fs::create_dir(&path).unwrap();
            let vault = Vault::open(path.to_string_lossy().into_owned()).unwrap();
            TempVault { path, vault }
        }
    }

    impl Drop for TempVault {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn creates_a_note_and_reads_it_back() {
        let tv = TempVault::new();
        let outcome = tv
            .vault
            .write_text("notes/a.md".into(), "hello\n".into(), None, true)
            .unwrap();
        assert_eq!(outcome.hash, hash(b"hello\n"));
        assert_eq!(outcome.revision, "1");
        assert!(tv.vault.exists("notes/a.md".into()).unwrap());
        assert_eq!(
            tv.vault.read_text("notes/a.md".into()).unwrap().text,
            "hello\n"
        );
        // The intermediate directory was created and is visible.
        assert!(tv
            .vault
            .list(None)
            .unwrap()
            .iter()
            .any(|entry| entry.path == "notes" && entry.is_directory));
    }

    #[test]
    fn writes_and_reads_binary() {
        let tv = TempVault::new();
        // JPEG-ish magic bytes into a Media/ subfolder (created on the fly).
        let bytes = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
        let outcome = tv
            .vault
            .write_binary(
                "Reflection Garden/Media/cover.jpg".into(),
                bytes.clone(),
                true,
            )
            .unwrap();
        assert_eq!(outcome.hash, hash(&bytes));
        let read = tv
            .vault
            .read_binary("Reflection Garden/Media/cover.jpg".into())
            .unwrap();
        assert_eq!(read, bytes);
    }

    #[test]
    fn write_binary_refuses_traversal() {
        let tv = TempVault::new();
        let err = tv
            .vault
            .write_binary("../escape.jpg".into(), vec![1, 2, 3], true)
            .unwrap_err();
        assert!(matches!(err, VaultError::PathEscape));
    }

    #[test]
    fn create_new_refuses_an_existing_path() {
        let tv = TempVault::new();
        tv.vault
            .write_text("a.md".into(), "one\n".into(), None, true)
            .unwrap();
        let err = tv
            .vault
            .write_text("a.md".into(), "two\n".into(), None, true)
            .unwrap_err();
        assert!(matches!(err, VaultError::Conflict));
        // The original content is untouched.
        assert_eq!(tv.vault.read_text("a.md".into()).unwrap().text, "one\n");
    }

    #[test]
    fn overwrite_honours_the_expected_hash() {
        let tv = TempVault::new();
        let first = tv
            .vault
            .write_text("a.md".into(), "one\n".into(), None, true)
            .unwrap();
        // Correct expected hash overwrites and bumps the revision.
        let second = tv
            .vault
            .write_text(
                "a.md".into(),
                "two\n".into(),
                Some(first.hash.clone()),
                false,
            )
            .unwrap();
        assert_eq!(second.revision, "2");
        assert_eq!(tv.vault.read_text("a.md".into()).unwrap().text, "two\n");
        // A stale expected hash is rejected and nothing changes.
        let err = tv
            .vault
            .write_text("a.md".into(), "three\n".into(), Some(first.hash), false)
            .unwrap_err();
        assert!(matches!(err, VaultError::Conflict));
        assert_eq!(tv.vault.read_text("a.md".into()).unwrap().text, "two\n");
        assert_eq!(tv.vault.get_revision().unwrap(), "2");
    }

    #[test]
    fn rejects_paths_that_escape_or_hit_internals() {
        let tv = TempVault::new();
        for bad in ["../evil.md", "a/../b.md", ".studio-x.md", "/abs.md", "a/"] {
            let err = tv
                .vault
                .write_text(bad.into(), "x".into(), None, true)
                .unwrap_err();
            assert!(
                matches!(err, VaultError::PathEscape),
                "expected escape for {bad}"
            );
        }
    }

    #[test]
    fn revision_increases_monotonically() {
        let tv = TempVault::new();
        assert_eq!(tv.vault.get_revision().unwrap(), "0");
        tv.vault
            .write_text("a.md".into(), "a\n".into(), None, true)
            .unwrap();
        tv.vault
            .write_text("b.md".into(), "b\n".into(), None, true)
            .unwrap();
        assert_eq!(tv.vault.get_revision().unwrap(), "2");
    }
}
