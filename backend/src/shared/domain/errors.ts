export type ErrorDetails = Readonly<Record<string, unknown>>;

export abstract class AppError extends Error {
  readonly code: string;
  readonly details: ErrorDetails;

  protected constructor(code: string, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class DomainError extends AppError {
  constructor(code: string, message: string, details?: ErrorDetails) {
    super(code, message, details);
  }
}

export class ApplicationError extends AppError {
  constructor(code: string, message: string, details?: ErrorDetails) {
    super(code, message, details);
  }
}

export class InvalidCursorError extends ApplicationError {
  constructor() {
    super("INVALID_CURSOR", "The supplied cursor is invalid");
  }
}
