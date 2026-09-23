export class ValidationError extends Error {
  constructor(errors, message = 'Memory failed validation') {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}
