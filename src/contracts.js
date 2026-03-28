export class BracketsError extends Error {
  constructor(message, {
    code = 'BRACKETS_ERROR',
    statusCode = 500,
    issues = [],
    hint = null,
    cause = null
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'BracketsError';
    this.code = code;
    this.statusCode = statusCode;
    this.issues = issues;
    this.hint = hint;
  }
}

export class BracketsContractError extends BracketsError {
  constructor(message, options = {}) {
    super(message, {
      code: 'BRACKETS_CONTRACT_INVALID',
      statusCode: 400,
      ...options
    });
    this.name = 'BracketsContractError';
  }
}

export function describeValueType(value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createIssue(path, expected, actual, message = null) {
  return {
    path,
    expected,
    actual,
    message: message ?? `${path} must be ${expected}; received ${actual}`
  };
}

export function throwContractIssues(message, issues, options = {}) {
  if (!issues.length) {
    return;
  }

  throw new BracketsContractError(message, {
    issues,
    ...options
  });
}

function validateStringField(issues, value, fieldPath, { required = false, allowEmpty = false } = {}) {
  if (value === undefined) {
    if (required) {
      issues.push(createIssue(fieldPath, 'a non-empty string', 'undefined'));
    }
    return;
  }

  if (typeof value !== 'string') {
    issues.push(createIssue(fieldPath, 'a string', describeValueType(value)));
    return;
  }

  if (!allowEmpty && !value.trim()) {
    issues.push(createIssue(fieldPath, 'a non-empty string', 'empty string'));
  }
}

function validateStringArray(issues, value, fieldPath) {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    issues.push(createIssue(fieldPath, 'an array of strings', describeValueType(value)));
    return;
  }

  value.forEach((entry, index) => {
    if (typeof entry !== 'string') {
      issues.push(createIssue(`${fieldPath}[${index}]`, 'a string', describeValueType(entry)));
    }
  });
}

function validateStringRecord(issues, value, fieldPath) {
  if (value === undefined) {
    return;
  }

  if (!isPlainObject(value)) {
    issues.push(createIssue(fieldPath, 'an object', describeValueType(value)));
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      issues.push(createIssue(`${fieldPath}.${key}`, 'a string', describeValueType(entry)));
    }
  }
}

export const BRACKETS_CONFIG_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://brackets.dev/schemas/brackets-config.json',
  title: 'Brackets Config',
  type: 'object',
  properties: {
    server: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'integer', minimum: 1 }
      },
      additionalProperties: true
    },
    branding: {
      type: 'object',
      additionalProperties: true
    },
    splash: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        chips: { type: 'array', items: { type: 'string' } },
        hints: { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: true
    },
    security: {
      type: 'object',
      properties: {
        html: { enum: ['sanitize', 'trusted'] }
      },
      additionalProperties: true
    }
  },
  additionalProperties: true
};

export function validateBracketsConfig(config, context = 'Brackets config') {
  const issues = [];

  if (!isPlainObject(config)) {
    throwContractIssues(`${context} is invalid`, [
      createIssue(context, 'an object', describeValueType(config))
    ], {
      code: 'BRACKETS_CONFIG_INVALID',
      hint: 'Use config/brackets.json or config/brackets.yaml with object-shaped sections like server, branding, splash, and security.'
    });
  }

  if (config.server !== undefined) {
    if (!isPlainObject(config.server)) {
      issues.push(createIssue(`${context}.server`, 'an object', describeValueType(config.server)));
    } else {
      validateStringField(issues, config.server.host, `${context}.server.host`, { allowEmpty: false });
      if (config.server.port !== undefined) {
        if (!Number.isInteger(config.server.port) || config.server.port < 1) {
          issues.push(createIssue(`${context}.server.port`, 'a positive integer', describeValueType(config.server.port)));
        }
      }
    }
  }

  if (config.branding !== undefined) {
    if (!isPlainObject(config.branding)) {
      issues.push(createIssue(`${context}.branding`, 'an object', describeValueType(config.branding)));
    } else {
      for (const field of ['name', 'title', 'tagline', 'accent', 'accentSoft', 'canvas', 'panel', 'ink', 'muted']) {
        validateStringField(issues, config.branding[field], `${context}.branding.${field}`);
      }
    }
  }

  if (config.splash !== undefined) {
    if (!isPlainObject(config.splash)) {
      issues.push(createIssue(`${context}.splash`, 'an object', describeValueType(config.splash)));
    } else {
      if (config.splash.enabled !== undefined && typeof config.splash.enabled !== 'boolean') {
        issues.push(createIssue(`${context}.splash.enabled`, 'a boolean', describeValueType(config.splash.enabled)));
      }
      validateStringArray(issues, config.splash.chips, `${context}.splash.chips`);
      validateStringArray(issues, config.splash.hints, `${context}.splash.hints`);
    }
  }

  if (config.security !== undefined) {
    if (!isPlainObject(config.security)) {
      issues.push(createIssue(`${context}.security`, 'an object', describeValueType(config.security)));
    } else if (config.security.html !== undefined && !['sanitize', 'trusted'].includes(config.security.html)) {
      issues.push(createIssue(`${context}.security.html`, '"sanitize" or "trusted"', JSON.stringify(config.security.html)));
    }
  }

  throwContractIssues(`${context} is invalid`, issues, {
    code: 'BRACKETS_CONFIG_INVALID',
    hint: 'Check config/brackets.json or config/brackets.yaml for wrong field types.'
  });

  return config;
}

export function validatePageManifestContract(definition, {
  context = 'Brackets page()',
  allowedFields = [],
  requiredFields = ['id', 'html']
} = {}) {
  const issues = [];
  const allowed = new Set(allowedFields);

  if (!isPlainObject(definition)) {
    throwContractIssues(`${context} is invalid`, [
      createIssue(context, 'an object', describeValueType(definition))
    ], {
      code: 'BRACKETS_PAGE_INVALID',
      hint: 'Use page({ id, html, ... }) with an object-shaped manifest.'
    });
  }

  const unknown = Object.keys(definition).filter((key) => !allowed.has(key));
  for (const field of unknown) {
    issues.push(createIssue(`${context}.${field}`, 'a known page field', 'unknown field'));
  }

  for (const field of requiredFields) {
    validateStringField(issues, definition[field], `${context}.${field}`, { required: true });
  }

  for (const field of ['logic', 'route', 'alias', 'redirectTo', 'preload', 'title', 'layout']) {
    validateStringField(issues, definition[field], `${context}.${field}`);
  }

  validateStringArray(issues, definition.aliases, `${context}.aliases`);
  validateStringRecord(issues, definition.params, `${context}.params`);
  validateStringRecord(issues, definition.api, `${context}.api`);
  validateStringRecord(issues, definition.data, `${context}.data`);

  for (const field of ['meta', 'seo', 'auth', 'assets']) {
    if (definition[field] !== undefined && !isPlainObject(definition[field])) {
      issues.push(createIssue(`${context}.${field}`, 'an object', describeValueType(definition[field])));
    }
  }

  throwContractIssues(`${context} is invalid`, issues, {
    code: 'BRACKETS_PAGE_INVALID',
    hint: 'Check the page manifest field names and make sure string maps like params, api, and data only contain strings.'
  });

  return definition;
}
