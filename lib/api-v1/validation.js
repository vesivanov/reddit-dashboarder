// Validation schemas for Agent API v1
// Lightweight validation without external dependencies (Joi/Zod)

const VALIDATION_ERRORS = {
  REQUIRED: (field) => ({ field, message: `${field} is required` }),
  TYPE: (field, expected) => ({ field, message: `${field} must be ${expected}` }),
  RANGE: (field, min, max) => ({ field, message: `${field} must be between ${min} and ${max}` }),
  FORMAT: (field, description) => ({ field, message: `${field} ${description}` }),
  LENGTH: (field, max) => ({ field, message: `${field} must not exceed ${max} characters` }),
  ARRAY_MAX: (field, max) => ({ field, message: `${field} must not exceed ${max} items` }),
};

/**
 * Validate a string field
 */
function validateString(value, field, options = {}) {
  const { required = false, min, max, pattern, lowercase = false, noSpaces = false } = options;
  
  if (value === undefined || value === null) {
    if (required) return VALIDATION_ERRORS.REQUIRED(field);
    return null;
  }
  
  if (typeof value !== 'string') {
    return VALIDATION_ERRORS.TYPE(field, 'a string');
  }
  
  if (min !== undefined && value.length < min) {
    return { field, message: `${field} must be at least ${min} characters` };
  }
  
  if (max !== undefined && value.length > max) {
    return VALIDATION_ERRORS.LENGTH(field, max);
  }
  
  if (lowercase && value !== value.toLowerCase()) {
    return VALIDATION_ERRORS.FORMAT(field, 'must be lowercase');
  }
  
  if (noSpaces && value.includes(' ')) {
    return VALIDATION_ERRORS.FORMAT(field, 'must not contain spaces');
  }
  
  if (pattern && !pattern.test(value)) {
    return VALIDATION_ERRORS.FORMAT(field, 'has invalid format');
  }
  
  return null;
}

/**
 * Validate a number field
 */
function validateNumber(value, field, options = {}) {
  const { required = false, min, max, integer = false } = options;
  
  if (value === undefined || value === null) {
    if (required) return VALIDATION_ERRORS.REQUIRED(field);
    return null;
  }
  
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return VALIDATION_ERRORS.TYPE(field, 'a number');
  }
  
  if (integer && !Number.isInteger(value)) {
    return VALIDATION_ERRORS.TYPE(field, 'an integer');
  }
  
  if (min !== undefined && value < min) {
    return { field, message: `${field} must be at least ${min}` };
  }
  
  if (max !== undefined && value > max) {
    return { field, message: `${field} must not exceed ${max}` };
  }
  
  return null;
}

/**
 * Validate an array field
 */
function validateArray(value, field, options = {}) {
  const { required = false, min, max, itemValidator } = options;
  
  if (value === undefined || value === null) {
    if (required) return VALIDATION_ERRORS.REQUIRED(field);
    return null;
  }
  
  if (!Array.isArray(value)) {
    return VALIDATION_ERRORS.TYPE(field, 'an array');
  }
  
  if (min !== undefined && value.length < min) {
    return { field, message: `${field} must have at least ${min} items` };
  }
  
  if (max !== undefined && value.length > max) {
    return VALIDATION_ERRORS.ARRAY_MAX(field, max);
  }
  
  // Validate each item if validator provided
  if (itemValidator) {
    for (let i = 0; i < value.length; i++) {
      const itemError = itemValidator(value[i], `${field}[${i}]`);
      if (itemError) return itemError;
    }
  }
  
  return null;
}

/**
 * Validate an object field
 */
function validateObject(value, field, options = {}) {
  const { required = false, schema } = options;
  
  if (value === undefined || value === null) {
    if (required) return VALIDATION_ERRORS.REQUIRED(field);
    return null;
  }
  
  if (typeof value !== 'object' || Array.isArray(value)) {
    return VALIDATION_ERRORS.TYPE(field, 'an object');
  }
  
  if (schema) {
    const errors = validateSchema(value, schema);
    if (errors.length > 0) return errors[0]; // Return first error
  }
  
  return null;
}

/**
 * Validate against a schema object
 */
function validateSchema(data, schema) {
  const errors = [];
  
  for (const [field, validator] of Object.entries(schema)) {
    const value = data?.[field];
    const error = validator(value, field);
    if (error) {
      if (Array.isArray(error)) {
        errors.push(...error);
      } else {
        errors.push(error);
      }
    }
  }
  
  return errors;
}

// ============================================================
// Config Validation Schema (for PATCH /config)
// ============================================================

const subredditValidator = (value, field) => 
  validateString(value, field, { 
    required: true, 
    lowercase: true, 
    noSpaces: true,
    min: 2,
    max: 21, // Reddit max subreddit name length
  });

const FILTERS_SCHEMA = {
  minScore: (v, f) => validateNumber(v, f, { min: 0 }),
  minComments: (v, f) => validateNumber(v, f, { min: 0 }),
  daysBack: (v, f) => validateNumber(v, f, { integer: true, min: 1, max: 7 }),
};

const SCORING_EXAMPLES_SCHEMA = {
  perfect: (value, field) => validateString(value, field, { max: 1200 }),
  strong: (value, field) => validateString(value, field, { max: 1200 }),
  reject: (value, field) => validateString(value, field, { max: 1200 }),
};

const SCORING_CONFIG_SCHEMA = {
  lookingFor: (value, field) => validateString(value, field, { max: 1200 }),
  avoid: (value, field) => validateString(value, field, { max: 800 }),
  examples: (value, field) => validateObject(value, field, { schema: SCORING_EXAMPLES_SCHEMA }),
};

const CONFIG_SCHEMA = {
  subreddits: (value, field) => validateArray(value, field, {
    max: 10,
    itemValidator: subredditValidator,
  }),
  
  filters: (value, field) => validateObject(value, field, {
    schema: FILTERS_SCHEMA,
  }),
  
  goals: (value, field) => validateString(value, field, { max: 500 }),

  aiContext: (value, field) => validateString(value, field, { max: 600 }),
  
  aiPrompt: (value, field) => validateString(value, field, { max: 2000 }),

  scoringConfig: (value, field) => validateObject(value, field, {
    schema: SCORING_CONFIG_SCHEMA,
  }),
  
  threshold: (value, field) => validateNumber(value, field, { 
    integer: true, 
    min: 0, 
    max: 5 
  }),
  
  model: (value, field) => validateString(value, field, { 
    max: 100,
    pattern: /^[a-zA-Z0-9_.:\-\/]+$/, // OpenRouter model ID format
  }),
};

// ============================================================
// Snapshot Validation Schema
// ============================================================

const SNAPSHOT_SCHEMA = {
  posts: (value, field) => validateArray(value, field, { required: true }),
  settings: (value, field) => validateObject(value, field),
  filters: (value, field) => validateObject(value, field),
  timestamp: (value, field) => validateString(value, field),
};

// ============================================================
// Main Export
// ============================================================

module.exports = {
  // Validators
  validateString,
  validateNumber,
  validateArray,
  validateObject,
  validateSchema,
  
  // Schemas
  CONFIG_SCHEMA,
  FILTERS_SCHEMA,
  SCORING_CONFIG_SCHEMA,
  SNAPSHOT_SCHEMA,
  
  // Errors
  VALIDATION_ERRORS,
};
