use std::path::{Component, Path, PathBuf};

use crate::commands::vault::VaultError;

/// Resolves a portable vault-relative path without following a symlink outside the vault.
pub fn resolve_inside(root: &Path, relative: &str) -> Result<PathBuf, VaultError> {
    let root = root.canonicalize().map_err(|_| VaultError::Unavailable)?;
    validate_relative(relative)?;
    let candidate = root.join(relative);

    let mut existing = candidate.as_path();
    while !existing.exists() {
        existing = existing.parent().ok_or(VaultError::PathEscape)?;
    }
    let canonical_existing = existing
        .canonicalize()
        .map_err(|_| VaultError::Unavailable)?;
    if !canonical_existing.starts_with(&root) {
        return Err(VaultError::PathEscape);
    }
    if candidate.exists() {
        let canonical_candidate = candidate
            .canonicalize()
            .map_err(|_| VaultError::Unavailable)?;
        if !canonical_candidate.starts_with(&root) {
            return Err(VaultError::PathEscape);
        }
    }
    Ok(candidate)
}

fn validate_relative(relative: &str) -> Result<(), VaultError> {
    if relative.is_empty()
        || relative == "."
        || relative.contains('\0')
        || relative.contains('\\')
        || relative.starts_with('/')
        || relative.ends_with('/')
        || relative.as_bytes().get(1) == Some(&b':')
    {
        return Err(VaultError::PathEscape);
    }
    if Path::new(relative)
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(VaultError::PathEscape);
    }
    if relative
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(VaultError::PathEscape);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::resolve_inside;

    #[test]
    fn rejects_parent_traversal() {
        assert!(resolve_inside(Path::new("/vault"), "../secret.md").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlink_escape() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        symlink(outside.path(), root.path().join("escape")).unwrap();
        assert!(resolve_inside(root.path(), "escape/secret.md").is_err());
    }
}
