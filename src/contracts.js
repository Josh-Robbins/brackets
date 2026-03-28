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

function validateFunctionRecord(issues, value, fieldPath) {
  if (!isPlainObject(value)) {
    issues.push(createIssue(fieldPath, 'an object', describeValueType(value)));
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'function') {
      issues.push(createIssue(`${fieldPath}.${key}`, 'a function', describeValueType(entry)));
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
        html: { enum: ['sanitize', 'trusted'] },
        storage: {
          type: 'object',
          properties: {
            keyEnv: { type: 'string' },
            pbkdf2Iterations: { type: 'integer', minimum: 1 }
          },
          additionalProperties: true
        }
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
    } else {
      if (config.security.html !== undefined && !['sanitize', 'trusted'].includes(config.security.html)) {
        issues.push(createIssue(`${context}.security.html`, '"sanitize" or "trusted"', JSON.stringify(config.security.html)));
      }

      if (config.security.storage !== undefined) {
        if (!isPlainObject(config.security.storage)) {
          issues.push(createIssue(`${context}.security.storage`, 'an object', describeValueType(config.security.storage)));
        } else {
          validateStringField(issues, config.security.storage.keyEnv, `${context}.security.storage.keyEnv`);
          if (config.security.storage.pbkdf2Iterations !== undefined) {
            if (!Number.isInteger(config.security.storage.pbkdf2Iterations) || config.security.storage.pbkdf2Iterations < 1) {
              issues.push(createIssue(
                `${context}.security.storage.pbkdf2Iterations`,
                'a positive integer',
                describeValueType(config.security.storage.pbkdf2Iterations)
              ));
            }
          }
        }
      }
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

export function validateLogicModuleContract(definition, context = 'Brackets logic module') {
  const issues = [];

  if (!isPlainObject(definition)) {
    throwContractIssues(`${context} is invalid`, [
      createIssue(context, 'an object', describeValueType(definition))
    ], {
      code: 'BRACKETS_LOGIC_INVALID',
      hint: 'Export an object from .logic files. Use mount(), sync(), run(), and named action functions for behavior.'
    });
  }

  for (const [key, value] of Object.entries(definition)) {
    if (typeof value !== 'function') {
      issues.push(createIssue(`${context}.${key}`, 'a function', describeValueType(value)));
    }
  }

  throwContractIssues(`${context} is invalid`, issues, {
    code: 'BRACKETS_LOGIC_INVALID',
    hint: 'Brackets .logic files should export an object of functions. Use mount(), sync(), run(), and named actions as function members.'
  });

  return definition;
}

export function validateRpcModuleContract(definition, {
  context = 'Brackets RPC module',
  code = 'BRACKETS_RPC_MODULE_INVALID',
  kind = 'module'
} = {}) {
  const issues = [];

  if (!isPlainObject(definition)) {
    throwContractIssues(`${context} is invalid`, [
      createIssue(context, 'an object', describeValueType(definition))
    ], {
      code,
      hint: `Export an object from .${kind} files and expose callable methods as functions.`
    });
  }

  validateFunctionRecord(issues, definition, context);

  throwContractIssues(`${context} is invalid`, issues, {
    code,
    hint: `Brackets .${kind} files should export an object whose members are functions.`
  });

  return definition;
}

export function validateRouterModuleContract(definition, context = 'Brackets router.logic module') {
  const issues = [];

  if (Array.isArray(definition)) {
    return definition;
  }

  if (!isPlainObject(definition)) {
    throwContractIssues(`${context} is invalid`, [
      createIssue(context, 'an object or route array', describeValueType(definition))
    ], {
      code: 'BRACKETS_ROUTER_INVALID',
      hint: 'Export a route array or an object with optional defaults, routes, and router hooks like beforeEach().'
    });
  }

  if (definition.defaults !== undefined && !isPlainObject(definition.defaults)) {
    issues.push(createIssue(`${context}.defaults`, 'an object', describeValueType(definition.defaults)));
  }

  if (definition.routes !== undefined && !Array.isArray(definition.routes)) {
    issues.push(createIssue(`${context}.routes`, 'an array', describeValueType(definition.routes)));
  }

  for (const field of ['beforeEach', 'afterEach', 'notFound']) {
    if (definition[field] !== undefined && typeof definition[field] !== 'function') {
      issues.push(createIssue(`${context}.${field}`, 'a function', describeValueType(definition[field])));
    }
  }

  throwContractIssues(`${context} is invalid`, issues, {
    code: 'BRACKETS_ROUTER_INVALID',
    hint: 'router.logic and /routes/*.logic should use object-shaped router config with function hooks and array-based routes when present.'
  });

  return definition;
}
