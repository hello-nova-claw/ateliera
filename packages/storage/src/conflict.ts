export class VaultConflictError extends Error {
  override readonly name = 'VaultConflictError';

  constructor(message = 'Ateliera file changed before the operation could be completed.') {
    super(message);
  }
}

export class PathEscapeError extends Error {
  override readonly name = 'PathEscapeError';

  constructor(message = 'Ateliera file location is not valid.') {
    super(message);
  }
}

export class VaultUnavailableError extends Error {
  override readonly name = 'VaultUnavailableError';

  constructor(message = 'The requested Studio file is unavailable.') {
    super(message);
  }
}
