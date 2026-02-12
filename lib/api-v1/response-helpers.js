// Shared API response helpers for Agent API v1
// Provides consistent response format with requestId, timings, schemaVersion

const SCHEMA_VERSION = '1.0.0';

/**
 * Generate a unique request ID
 * Format: req_<timestamp>_<random>
 */
function generateRequestId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `req_${timestamp}_${random}`;
}

/**
 * Create a standard success response
 */
function createSuccessResponse(data, timings = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    requestId: generateRequestId(),
    timings: {
      totalMs: timings.totalMs || 0,
      ...(timings.dbMs && { dbMs: timings.dbMs }),
      ...(timings.computeMs && { computeMs: timings.computeMs }),
      ...timings,
    },
    data,
    error: null,
  };
}

/**
 * Create a standard error response
 */
function createErrorResponse(errorCode, message, details = null) {
  const error = {
    schemaVersion: SCHEMA_VERSION,
    requestId: generateRequestId(),
    error: {
      code: errorCode,
      message,
      ...(details && { details }),
    },
  };
  return error;
}

/**
 * HTTP status codes mapped to error codes
 */
const ERROR_CODES = {
  UNAUTHORIZED: { code: 'UNAUTHORIZED', status: 401 },
  NOT_FOUND: { code: 'NOT_FOUND', status: 404 },
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', status: 400 },
  RATE_LIMITED: { code: 'RATE_LIMITED', status: 429 },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500 },
};

/**
 * Timing helper - measure execution time
 */
function createTimer() {
  const start = process.hrtime.bigint();
  return {
    elapsedMs: () => {
      const end = process.hrtime.bigint();
      return Number(end - start) / 1_000_000; // Convert nanoseconds to milliseconds
    },
  };
}

/**
 * Async handler wrapper with automatic timing
 */
function withTiming(handler) {
  return async (req, res, ...args) => {
    const timer = createTimer();
    try {
      const result = await handler(req, res, ...args);
      const totalMs = Math.round(timer.elapsedMs());
      
      // If result is an object and res.json hasn't been called yet
      if (result && typeof result === 'object' && !res.headersSent) {
        // Add timing to the response if it's a standard response
        if (result.schemaVersion && result.timings) {
          result.timings.totalMs = totalMs;
          return res.status(result.status || 200).json(result);
        }
      }
      
      return result;
    } catch (error) {
      const totalMs = Math.round(timer.elapsedMs());
      console.error('[api-v1] Handler error:', error);
      
      if (!res.headersSent) {
        const errorResponse = createErrorResponse(
          ERROR_CODES.INTERNAL_ERROR.code,
          error.message || 'Internal server error'
        );
        errorResponse.timings = { totalMs };
        return res.status(500).json(errorResponse);
      }
    }
  };
}

module.exports = {
  SCHEMA_VERSION,
  generateRequestId,
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
  createTimer,
  withTiming,
};
