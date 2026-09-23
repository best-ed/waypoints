export class ValidationError extends Error {
  constructor(errors, message = 'Memory failed validation') {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class StorageFullError extends Error {
  constructor(cause, message = 'Storage is full') {
    super(message);
    this.name = 'StorageFullError';
    this.cause = cause;
  }
}
