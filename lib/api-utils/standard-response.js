// Shared API response helpers for Agent API v1
// Phase 0: Infrastructure for consistent responses

const SCHEMA_VERSION = '1.0.0';

/**
 * Generate a unique request ID
 */
function generateRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build standardized success response
 */
function successResponse(data, timings = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    requestId: generateRequestId(),
    timings: {
      totalMs: timings.totalMs || 0,
      ...(timings.dbMs && { dbMs: timings.dbMs }),
      ...(timings.computeMs && { computeMs: timings.computeMs }),
    },
    data,
    error: null,
  };
}

/**
 * Build standardized error response
 */
function errorResponse(code, message, details = null, timings = {}) {
  const response = {
    schemaVersion: SCHEMA_VERSION,
    requestId: generateRequestId(),
    timings: {
      totalMs: timings.totalMs || 0,
    },
    data: null,
    error: {
      code,
      message,
    },
  };

  if (details) {
    response.error.details = details;
  }

  return response;
}

/**
 * HTTP status codes mapped to error codes
 */
const HTTP_ERRORS = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

/**
 * Wrap handler with requestId + timing tracking
 */
function withStandardResponse(handler) {
  return async (req, res) => {
    const startTime = Date.now();
    const requestId = generateRequestId();

    // Attach to req for handlers to use
    req.requestId = requestId;
    req.startTime = startTime;

    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[${requestId}] Unhandled error:`, err);

      const statusCode = err.statusCode || 500;
      const errorCode = HTTP_ERRORS[statusCode] || 'INTERNAL_ERROR';

      if (!res.headersSent) {
        res.status(statusCode).json(
          errorResponse(errorCode, err.message || 'Internal server error', null, {
            totalMs: Date.now() - startTime,
          })
        );
      }
    }
  };
}

module.exports = {
  SCHEMA_VERSION,
  generateRequestId,
  successResponse,
  errorResponse,
  HTTP_ERRORS,
  withStandardResponse,
};
