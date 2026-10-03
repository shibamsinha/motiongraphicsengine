export const ErrorCode = {
  VALIDATION: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNSUPPORTED: 'UNSUPPORTED_CAPABILITY',
  CONFIRMATION: 'CONFIRMATION_REQUIRED',
  UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RENDER_FAILED: 'RENDER_FAILED',
  INTERNAL: 'INTERNAL_ERROR',
};

const RETRYABLE = new Set([ErrorCode.UNAVAILABLE]);

export class EngineError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.details = details;
    this.retryable = RETRYABLE.has(code);
  }
}

export const validationError = (message, details) =>
  new EngineError(ErrorCode.VALIDATION, message, details);

export const notFound = (message, details) =>
  new EngineError(ErrorCode.NOT_FOUND, message, details);

export const conflict = (message, details) =>
  new EngineError(ErrorCode.CONFLICT, message, details);

export const unsupported = (message, details) =>
  new EngineError(ErrorCode.UNSUPPORTED, message, details);

export const confirmationRequired = (message, details) =>
  new EngineError(ErrorCode.CONFIRMATION, message, details);

export const unavailable = (message, details) =>
  new EngineError(ErrorCode.UNAVAILABLE, message, details);

export const renderFailed = (message, details) =>
  new EngineError(ErrorCode.RENDER_FAILED, message, details);

export const ok = (payload) => ({
  content: [{ type: 'text', text: JSON.stringify({ success: true, ...payload }, null, 2) }],
});

export const fail = (error) => {
  const structured =
    error instanceof EngineError
      ? { code: error.code, message: error.message, retryable: error.retryable,
          ...(error.details ? { details: error.details } : {}) }
      : {
          code: ErrorCode.INTERNAL,
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        };

  return {
    isError: true,
    content: [
      { type: 'text', text: JSON.stringify({ success: false, error: structured }, null, 2) },
    ],
  };
};

export const guard = (handler) => async (args, extra) => {
  try {
    return await handler(args, extra);
  } catch (error) {
    return fail(error);
  }
};
