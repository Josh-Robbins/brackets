const STATIC_RULES = [
  {
    kind: 'directive',
    name: 'state',
    frameworkAttribute: 'data-brx-state',
    datastarAttribute: 'data-signals',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'calc',
    frameworkAttribute: 'data-brx-calc',
    datastarAttribute: 'data-computed',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'run',
    frameworkAttribute: 'data-brx-run',
    datastarAttribute: 'data-init',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'watch',
    frameworkAttribute: 'data-brx-watch',
    datastarAttribute: 'data-effect',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'text',
    frameworkAttribute: 'data-brx-text',
    datastarAttribute: 'data-text',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'html',
    frameworkAttribute: 'data-brx-html',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'show',
    frameworkAttribute: 'data-brx-show',
    datastarAttribute: 'data-show',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'bind',
    frameworkAttribute: 'data-brx-bind',
    datastarAttribute: 'data-bind',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'if',
    frameworkAttribute: 'data-brx-if',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'each',
    frameworkAttribute: 'data-brx-each',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'use',
    frameworkAttribute: 'data-brx-use',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'props',
    frameworkAttribute: 'data-brx-props',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'area',
    frameworkAttribute: 'data-brx-area',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'fill',
    frameworkAttribute: 'data-brx-fill',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'loading',
    frameworkAttribute: 'data-brx-loading',
    datastarAttribute: null,
    status: 'review-doc-present'
  },
  {
    kind: 'directive',
    name: 'error',
    frameworkAttribute: 'data-brx-error',
    datastarAttribute: null,
    status: 'review-doc-present'
  },
  {
    kind: 'flag',
    name: 'mount',
    frameworkAttribute: 'data-brx-mount',
    datastarAttribute: null,
    status: 'locked'
  }
];

const DYNAMIC_RULES = [
  {
    kind: 'dynamic-directive',
    prefix: 'class.',
    frameworkAttributePrefix: 'data-brx-class:',
    datastarAttributePrefix: 'data-class:',
    status: 'review-doc-present'
  },
  {
    kind: 'dynamic-directive',
    prefix: 'set.',
    frameworkAttributePrefix: 'data-brx-attr:',
    datastarAttributePrefix: 'data-attr:',
    status: 'review-doc-present'
  }
];

const FRAMEWORK_EVENT_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const FRAMEWORK_ACTION_CALL_PATTERN = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([\s\S]*)\)$/;
const FRAMEWORK_HELPERS = new Map([
  ['mutate', { runtimeTarget: 'window.BracketsRuntime.mutate' }],
  ['read', { runtimeTarget: 'window.BracketsRuntime.read', nativeAction: '@get' }],
  ['request', { runtimeTarget: 'window.BracketsRuntime.request', nativeAction: '@get' }],
  ['get', { runtimeTarget: 'window.BracketsRuntime.get', nativeAction: '@get' }],
  ['create', { runtimeTarget: 'window.BracketsRuntime.create', nativeAction: '@post' }],
  ['update', { runtimeTarget: 'window.BracketsRuntime.update', nativeAction: '@put' }],
  ['patch', { runtimeTarget: 'window.BracketsRuntime.patch', nativeAction: '@patch' }],
  ['delete', { runtimeTarget: 'window.BracketsRuntime.delete', nativeAction: '@delete' }],
  ['nav', { runtimeTarget: 'window.BracketsRuntime.nav' }],
  ['event', { runtimeTarget: 'evt' }]
]);
const IDENTIFIER_GLOBALS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'Infinity',
  'NaN',
  'Math',
  'Number',
  'String',
  'Boolean',
  'Array',
  'Object',
  'JSON',
  'Date',
  'Intl',
  'RegExp',
  'URL',
  'URLSearchParams',
  'console',
  'window',
  'document',
  'globalThis',
  'evt',
  'this',
  'new',
  'return',
  'typeof',
  'instanceof',
  'in',
  'await',
  'async'
]);

export const SYNTAX_CONTRACT = Object.freeze({
  static: STATIC_RULES,
  dynamic: DYNAMIC_RULES
});

function escapeAttributeValue(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function appendAttribute(attributes, name, value = '') {
  return `${attributes} ${name}="${escapeAttributeValue(value)}"`;
}

function splitTopLevelArguments(source) {
  const args = [];
  let current = '';
  let depth = 0;
  let quote = null;
  let escape = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      current += char;
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(' || char === '[' || char === '{') {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ')' || char === ']' || char === '}') {
      depth -= 1;
      current += char;
      continue;
    }

    if (char === ',' && depth === 0) {
      if (current.trim()) {
        args.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

function unwrapQuotedString(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return null;
  }

  const quote = trimmed[0];
  if ((quote !== '\'' && quote !== '"') || trimmed.at(-1) !== quote) {
    return null;
  }

  try {
    return JSON.parse(`"${trimmed.slice(1, -1).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  } catch {
    return trimmed.slice(1, -1);
  }
}

function isNativeMutatePath(pathExpression) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(pathExpression);
}

function transformNativeMutate(expression, options = {}) {
  if (options.skipNativeMutate) {
    return null;
  }

  const match = expression.trim().match(FRAMEWORK_ACTION_CALL_PATTERN);
  if (!match || match[1] !== 'mutate') {
    return null;
  }

  const args = splitTopLevelArguments(match[2]);
  if (args.length !== 2) {
    return null;
  }

  const statePath = unwrapQuotedString(args[0]);
  if (!statePath || !isNativeMutatePath(statePath)) {
    return null;
  }

  const target = statePath
    .split('.')
    .map((segment, index) => index === 0 ? `$${segment}` : segment)
    .join('.');

  return `${target} = ${transformDatastarExpression(args[1], { ...options, skipNativeMutate: true })}`;
}

function mergeClassAttribute(attributeSource, classNames) {
  if (!classNames.length) {
    return attributeSource;
  }

  const classMatch = attributeSource.match(/\sclass\s*=\s*"([^"]*)"/i);
  if (classMatch) {
    const current = classMatch[1].trim();
    const next = `${current} ${classNames.join(' ')}`.trim();
    return attributeSource.replace(classMatch[0], ` class="${next}"`);
  }

  return `${attributeSource} class="${classNames.join(' ')}"`;
}

function mergeIdAttribute(attributeSource, idValue) {
  if (!idValue || /\sid\s*=/.test(attributeSource)) {
    return attributeSource;
  }

  return `${attributeSource} id="${idValue}"`;
}

function injectFormContentType(expression) {
  const match = expression.match(FRAMEWORK_ACTION_CALL_PATTERN);
  if (!match) {
    return expression;
  }

  const [, helperName, rawArgs] = match;
  if (!['request', 'get', 'create', 'update', 'patch', 'delete'].includes(helperName)) {
    return expression;
  }

  const args = splitTopLevelArguments(rawArgs);
  if (args.length !== 1) {
    return expression;
  }

  return `${helperName}(${args[0]}, { contentType: 'form' })`;
}

function previousSignificantCharacter(source, startIndex) {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const char = source[index];
    if (!/\s/.test(char)) {
      return char;
    }
  }

  return '';
}

function nextSignificantCharacter(source, startIndex) {
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (!/\s/.test(char)) {
      return char;
    }
  }

  return '';
}

function nextNonWhitespace(source, startIndex) {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }
  return source.slice(index, index + 2);
}

function shouldPreserveIdentifier(expression, identifier, startIndex, endIndex) {
  const previous = previousSignificantCharacter(expression, startIndex);
  const next = nextSignificantCharacter(expression, endIndex);

  if (previous === '.' || previous === '$') {
    return true;
  }

  if (IDENTIFIER_GLOBALS.has(identifier)) {
    return true;
  }

  if (next === ':' && ['{', ',', '('].includes(previous)) {
    return true;
  }

  if (nextNonWhitespace(expression, endIndex) === '=>') {
    return true;
  }

  return false;
}

export function transformDatastarExpression(expression, options = {}) {
  if (!expression) {
    return expression;
  }

  const nativeMutate = transformNativeMutate(expression, options);
  if (nativeMutate) {
    return nativeMutate;
  }

  if (options.bindName) {
    return expression.trim().replace(/^\$/, '');
  }

  let output = '';
  let index = 0;
  let quote = null;
  let escape = false;

  while (index < expression.length) {
    const char = expression[index];

    if (quote) {
      output += char;
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char;
      output += char;
      index += 1;
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      let endIndex = index + 1;
      while (endIndex < expression.length && /[A-Za-z0-9_$]/.test(expression[endIndex])) {
        endIndex += 1;
      }

      const identifier = expression.slice(index, endIndex);
      if (shouldPreserveIdentifier(expression, identifier, index, endIndex)) {
        output += identifier;
      } else if (FRAMEWORK_HELPERS.has(identifier)) {
        const helper = FRAMEWORK_HELPERS.get(identifier);
        const next = nextSignificantCharacter(expression, endIndex);
        if (helper.nativeAction && next === '(') {
          output += helper.nativeAction;
        } else {
          output += helper.runtimeTarget;
        }
      } else {
        output += `$${identifier}`;
      }

      index = endIndex;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}

function applyDynamicRules(attributes) {
  let nextAttributes = attributes;

  for (const rule of DYNAMIC_RULES) {
    const escapedPrefix = rule.prefix.replace('.', '\\.');
    const pattern = new RegExp(`\\s:${escapedPrefix}([A-Za-z][A-Za-z0-9_:-]*)\\s*=\\s*"([^"]*)"`, 'g');
    nextAttributes = nextAttributes.replace(pattern, (_, name, expression) => {
      return appendAttribute('', `${rule.datastarAttributePrefix}${name}`, transformDatastarExpression(expression));
    });
  }

  return nextAttributes;
}

function applyStaticRules(attributes) {
  let nextAttributes = attributes;

  for (const rule of STATIC_RULES) {
    if (rule.kind === 'flag') {
      const pattern = new RegExp(`\\s:${rule.name}(?=(\\s|/|$))`, 'g');
      nextAttributes = nextAttributes.replace(pattern, () => {
        return appendAttribute('', rule.frameworkAttribute, '');
      });
      continue;
    }

    const pattern = new RegExp(`\\s:${rule.name}\\s*=\\s*"([^"]*)"`, 'g');
    nextAttributes = nextAttributes.replace(pattern, (_, expression) => {
      if (!rule.datastarAttribute) {
        return appendAttribute('', rule.frameworkAttribute, expression);
      }

      if (rule.name === 'bind') {
        return appendAttribute('', rule.datastarAttribute, transformDatastarExpression(expression, { bindName: true }));
      }

      return appendAttribute('', rule.datastarAttribute, transformDatastarExpression(expression));
    });
  }

  return nextAttributes;
}

function transformEventExpression(expression, eventName, tagName) {
  const normalized = tagName === 'form' && eventName === 'submit'
    ? injectFormContentType(expression)
    : expression;
  const trimmed = normalized.trim();

  if (FRAMEWORK_EVENT_PATTERN.test(trimmed)) {
    return {
      attribute: `data-on:${eventName}`,
      value: `window.BracketsRuntime.callAction(\"${trimmed}\", [], evt, el)`,
      framework: false
    };
  }

  const actionMatch = trimmed.match(FRAMEWORK_ACTION_CALL_PATTERN);
  if (actionMatch) {
    const [, actionName, rawArgs] = actionMatch;
    if (!FRAMEWORK_HELPERS.has(actionName)) {
      const args = splitTopLevelArguments(rawArgs).map((arg) => transformDatastarExpression(arg));
      return {
        attribute: `data-on:${eventName}`,
        value: `window.BracketsRuntime.callAction("${actionName}", [${args.join(', ')}], evt, el)`,
        framework: false
      };
    }
  }

  return {
    attribute: `data-on:${eventName}`,
    value: transformDatastarExpression(trimmed),
    framework: false
  };
}

function applyEventSyntax(attributes, tagName) {
  return attributes.replace(/\s@([A-Za-z][\w:-]*)\s*=\s*"([^"]*)"/g, (_, eventName, expression) => {
    const transformed = transformEventExpression(expression, eventName, tagName);
    if (transformed.framework) {
      return appendAttribute('', `data-brx-on:${eventName}`, transformed.value);
    }

    return appendAttribute('', transformed.attribute, transformed.value);
  });
}

function transformOpenTag(match, tagName, rawAttributes) {
  if (tagName.startsWith('/')) {
    return match;
  }

  let attributes = rawAttributes ?? '';
  const classNames = [];
  let idValue = '';

  attributes = attributes.replace(/\s\[([A-Za-z0-9_-]+)\]/g, (_, className) => {
    classNames.push(className);
    return '';
  });

  attributes = attributes.replace(/\s#([A-Za-z][A-Za-z0-9_-]*)/g, (_, nextId) => {
    idValue = nextId;
    return '';
  });

  attributes = applyEventSyntax(attributes, tagName);
  attributes = applyDynamicRules(attributes);
  attributes = applyStaticRules(attributes);
  attributes = mergeClassAttribute(attributes, classNames);
  attributes = mergeIdAttribute(attributes, idValue);

  return `<${tagName}${attributes}>`;
}

export function transformHtmlSyntax(source) {
  return source.replace(/<([A-Za-z][^\s/>]*)([^"'<>]*(?:"[^"]*"[^"'<>]*)*)>/g, transformOpenTag);
}
