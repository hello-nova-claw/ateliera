export class VaultConflictError extends Error {
  override readonly name = 'VaultConflictError';

  constructor(message = 'The vault entry changed before the operation could be completed.') {
    super(message);
  }
}

export class PathEscapeError extends Error {
  override readonly name = 'PathEscapeError';

  constructor(message = 'The vault path must be a normalized relative path.') {
    super(message);
  }
}

export class VaultUnavailableError extends Error {
  override readonly name = 'VaultUnavailableError';

  constructor(message = 'The requested vault entry is unavailable.') {
    super(message);
  }
}
