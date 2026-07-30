import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Diese API-Route wurde nicht gefunden.' }
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: issue.message,
        field: issue.path[0]
      }
    });
  }

  if (error instanceof ApiError) {
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.field ? { field: error.field } : {})
      }
    });
  }

  console.error('Unerwarteter API-Fehler:', error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Etwas ist schiefgelaufen. Bitte versuche es später erneut.' }
  });
}
