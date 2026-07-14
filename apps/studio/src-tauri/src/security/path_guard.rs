use std::path::{Component, Path};

use cap_fs_ext::DirExt;
use cap_std::fs::Dir;

use crate::commands::vault::VaultError;

pub struct ParentHandle {
    pub directory: Dir,
    pub basename: String,
}

pub(crate) fn is_internal_component(part: &str) -> bool {
    part.as_bytes()
        .get(..b".studio-".len())
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(b".studio-"))
}

pub fn validate_relative(relative: &str) -> Result<(), VaultError> {
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

pub fn open_parent(root: &Dir, relative: &str, create: bool) -> Result<ParentHandle, VaultError> {
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

pub fn open_existing_parent_optional(
    root: &Dir,
    relative: &str,
) -> Result<Option<ParentHandle>, VaultError> {
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
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(map_path_error(error)),
        }
    }

    Ok(Some(ParentHandle {
        directory: current,
        basename: basename.ok_or(VaultError::PathEscape)?,
    }))
}

pub fn map_path_error(error: std::io::Error) -> VaultError {
    if matches!(error.raw_os_error(), Some(code) if code == libc::ELOOP || code == libc::ENOTDIR) {
        VaultError::PathEscape
    } else {
        VaultError::Unavailable
    }
}

#[cfg(test)]
mod tests {
    use cap_std::{ambient_authority, fs::Dir};

    use super::*;

    #[test]
    fn rejects_parent_traversal() {
        assert!(validate_relative("../secret.md").is_err());
    }

    #[test]
    fn reserves_internal_studio_components() {
        for path in [
            ".studio-write.lock",
            ".STUDIO-write.lock",
            ".studio-control/config.json",
            "Notes/.studio-attack.md",
        ] {
            assert!(matches!(
                validate_relative(path),
                Err(VaultError::PathEscape)
            ));
        }
    }

    #[test]
    fn opens_each_parent_without_following_symlinks() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        symlink(outside.path(), root.path().join("escape")).unwrap();
        let directory = Dir::open_ambient_dir(root.path(), ambient_authority()).unwrap();
        assert!(matches!(
            open_parent(&directory, "escape/secret.md", false),
            Err(VaultError::PathEscape)
        ));
    }

    #[test]
    fn optional_parent_only_treats_confirmed_not_found_as_absent() {
        let root = tempfile::tempdir().unwrap();
        let directory = Dir::open_ambient_dir(root.path(), ambient_authority()).unwrap();
        assert!(open_existing_parent_optional(&directory, "missing/note.md")
            .unwrap()
            .is_none());

        std::fs::write(root.path().join("blocked"), b"not a directory").unwrap();
        assert!(matches!(
            open_existing_parent_optional(&directory, "blocked/note.md"),
            Err(VaultError::PathEscape)
        ));
    }
}
