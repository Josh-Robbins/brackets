/**
 * Brackets HTML/view → Datastar directive compiler (framework/syntax.js).
 * Interacts with: framework/runtime.js (consumed markup), tests/test.js.
 * Inline `@event` bodies use a lightweight scope-aware identifier rewrite toward Datastar
 * signals so callback params and local declarations do not get rewritten into signals.
 */
const STATIC_RULES = [
  {
    kind: 'directive',
    name: 'state',
    frameworkAttribute: 'data-b-state',
    datastarAttribute: 'data-signals',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'calc',
    frameworkAttribute: 'data-b-calc',
    datastarAttribute: 'data-computed',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'run',
    frameworkAttribute: 'data-b-run',
    datastarAttribute: 'data-init',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'watch',
    frameworkAttribute: 'data-b-watch',
    datastarAttribute: 'data-effect',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'text',
    frameworkAttribute: 'data-b-text',
    datastarAttribute: 'data-text',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'html',
    frameworkAttribute: 'data-b-html',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'show',
    frameworkAttribute: 'data-b-show',
    datastarAttribute: 'data-show',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'bind',
    frameworkAttribute: 'data-b-bind',
    datastarAttribute: 'data-bind',
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'if',
    frameworkAttribute: 'data-b-if',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'each',
    frameworkAttribute: 'data-b-each',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'use',
    frameworkAttribute: 'data-b-use',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'props',
    frameworkAttribute: 'data-b-props',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'area',
    frameworkAttribute: 'data-b-area',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'fill',
    frameworkAttribute: 'data-b-fill',
    datastarAttribute: null,
    status: 'locked'
  },
  {
    kind: 'directive',
    name: 'loading',
    frameworkAttribute: 'data-b-loading',
    datastarAttribute: null,
    status: 'review-doc-present'
  },
  {
    kind: 'directive',
    name: 'error',
    frameworkAttribute: 'data-b-error',
    datastarAttribute: null,
    status: 'review-doc-present'
  },
  {
    kind: 'flag',
    name: 'mount',
    frameworkAttribute: 'data-b-mount',
    datastarAttribute: null,
    status: 'locked'
  }
];

const DYNAMIC_RULES = [
  {
    kind: 'dynamic-directive',
    prefix: 'class.',
    frameworkAttributePrefix: 'data-b-class:',
    datastarAttributePrefix: 'data-class:',
    status: 'review-doc-present'
  },
  {
    kind: 'dynamic-directive',
    prefix: 'set.',
    frameworkAttributePrefix: 'data-b-attr:',
    datastarAttributePrefix: 'data-attr:',
    status: 'review-doc-present'
  }
];

const FRAMEWORK_EVENT_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const FRAMEWORK_ACTION_CALL_PATTERN = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([\s\S]*)\)$/;
const FRAMEWORK_SCOPE_GLOBALS = new Map([
  ['route', { runtimeTarget: 'window.BracketsRuntime.scope(el).route' }],
  ['nav', { runtimeTarget: 'window.BracketsRuntime.scope(el).nav' }],
  ['auth', { runtimeTarget: 'window.BracketsRuntime.scope(el).auth' }],
  ['requestState', { runtimeTarget: 'window.BracketsRuntime.scope(el).requestState' }],
  ['config', { runtimeTarget: 'window.BracketsRuntime.scope(el).config' }],
  ['host', { runtimeTarget: 'window.BracketsRuntime.scope(el).host' }],
  ['session', { runtimeTarget: 'window.BracketsRuntime.scope(el).session' }],
  ['self', { runtimeTarget: 'window.BracketsRuntime.scope(el).self' }],
  ['parent', { runtimeTarget: 'window.BracketsRuntime.scope(el).parent' }],
  ['children', { runtimeTarget: 'window.BracketsRuntime.scope(el).children' }],
  ['root', { runtimeTarget: 'window.BracketsRuntime.scope(el).root' }],
  ['props', { runtimeTarget: 'window.BracketsRuntime.scope(el).props' }],
  ['event', { runtimeTarget: 'window.BracketsRuntime.scope(el).event', eventRuntimeTarget: 'evt' }]
]);
const FRAMEWORK_HELPERS = new Map([
  ['mutate', { runtimeTarget: 'window.BracketsRuntime.mutate' }],
  ['read', { runtimeTarget: 'window.BracketsRuntime.read' }],
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
  'void',
  'instanceof',
  'in',
  'await',
  'async'
]);

/** ECMAScript keywords / reserved words that must not become `$keyword` in transformed expressions. */
const JAVASCRIPT_RESERVED_WORDS = new Set([
  'arguments',
  'as',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'do',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'implements',
  'import',
  'interface',
  'let',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'static',
  'super',
  'switch',
  'throw',
  'try',
  'var',
  'while',
  'with',
  'yield'
]);

export const SYNTAX_CONTRACT = Object.freeze({
  static: STATIC_RULES,
  dynamic: DYNAMIC_RULES
});

function escapeAttributeValue(value) {
  return String(value ?? '')
    .replace(/</g, '&lt;')
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

function bracketsStateKeyExpression(expression) {
  const trimmed = String(expression ?? '').trim();
  if (!trimmed) {
    return null;
  }

  const quoted = unwrapQuotedString(trimmed);
  if (quoted !== null) {
    return JSON.stringify(quoted);
  }

  if (/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(trimmed)) {
    return JSON.stringify(trimmed);
  }

  return null;
}

function compileFrameworkStatusDirective(name, expression) {
  const keyExpression = bracketsStateKeyExpression(expression);
  if (!keyExpression) {
    return null;
  }

  if (name === 'loading') {
    return appendAttribute('', 'data-show', `window.BracketsRuntime.requestState.loading(${keyExpression})`);
  }

  if (name === 'error') {
    return [
      appendAttribute('', 'data-show', `window.BracketsRuntime.requestState.hasError(${keyExpression})`),
      appendAttribute('', 'data-attr:title', `window.BracketsRuntime.requestState.message(${keyExpression}) || ''`)
    ].join('');
  }

  return null;
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

function nextNonWhitespaceIndex(source, startIndex) {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }
  return index;
}

function isIdentifierStart(char) {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char) {
  return /[A-Za-z0-9_$]/.test(char);
}

function createExpressionScope(kind = 'block') {
  return {
    kind,
    bindings: new Set(),
    concise: null
  };
}

function addBindingsToScope(scope, bindings = []) {
  for (const binding of bindings) {
    if (!binding || JAVASCRIPT_RESERVED_WORDS.has(binding)) {
      continue;
    }
    scope.bindings.add(binding);
  }
}

function nearestFunctionScope(scopes) {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    if (scopes[index].kind === 'function') {
      return scopes[index];
    }
  }
  return scopes[0];
}

function hasLocalBinding(scopes, identifier) {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    if (scopes[index].bindings.has(identifier)) {
      return true;
    }
  }
  return false;
}

function readIdentifier(source, startIndex) {
  if (!isIdentifierStart(source[startIndex] ?? '')) {
    return null;
  }

  let endIndex = startIndex + 1;
  while (endIndex < source.length && isIdentifierPart(source[endIndex])) {
    endIndex += 1;
  }

  return {
    name: source.slice(startIndex, endIndex),
    endIndex
  };
}

function findMatchingDelimiter(source, startIndex, openChar, closeChar) {
  if (source[startIndex] !== openChar) {
    return -1;
  }

  let depth = 0;
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] ?? '';

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function stripTopLevelInitializer(source) {
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] ?? '';

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
      continue;
    }
    if (char === ')') {
      parenDepth -= 1;
      continue;
    }
    if (char === '[') {
      bracketDepth += 1;
      continue;
    }
    if (char === ']') {
      bracketDepth -= 1;
      continue;
    }
    if (char === '{') {
      braceDepth += 1;
      continue;
    }
    if (char === '}') {
      braceDepth -= 1;
      continue;
    }

    if (parenDepth || bracketDepth || braceDepth) {
      continue;
    }

    if (char === '=' && next !== '=' && next !== '>' && source[index - 1] !== '!' && source[index - 1] !== '<' && source[index - 1] !== '>') {
      return source.slice(0, index).trim();
    }
  }

  const relationMatch = source.match(/^([\s\S]*?)\s+\b(?:of|in)\b\s+[\s\S]*$/);
  return relationMatch ? relationMatch[1].trim() : source.trim();
}

function extractBindingsFromPattern(source) {
  const bindings = new Set();
  let quote = null;
  let escape = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
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
      continue;
    }

    if (!isIdentifierStart(char)) {
      continue;
    }

    const token = readIdentifier(source, index);
    if (!token) {
      continue;
    }

    const previous = previousSignificantCharacter(source, index);
    const next = nextSignificantCharacter(source, token.endIndex);
    if (
      previous !== '.'
      && next !== ':'
      && !IDENTIFIER_GLOBALS.has(token.name)
      && !JAVASCRIPT_RESERVED_WORDS.has(token.name)
    ) {
      bindings.add(token.name);
    }

    index = token.endIndex - 1;
  }

  return [...bindings];
}

function extractBindingsFromParameterList(source) {
  return splitTopLevelArguments(source)
    .flatMap((entry) => extractBindingsFromPattern(stripTopLevelInitializer(entry)));
}

function findStatementBoundary(source, startIndex) {
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] ?? '';

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
      continue;
    }
    if (char === ')') {
      if (!parenDepth && !bracketDepth && !braceDepth) {
        return index;
      }
      parenDepth -= 1;
      continue;
    }
    if (char === '[') {
      bracketDepth += 1;
      continue;
    }
    if (char === ']') {
      bracketDepth -= 1;
      continue;
    }
    if (char === '{') {
      braceDepth += 1;
      continue;
    }
    if (char === '}') {
      if (!parenDepth && !bracketDepth && !braceDepth) {
        return index;
      }
      braceDepth -= 1;
      continue;
    }

    if (!parenDepth && !bracketDepth && !braceDepth && char === ';') {
      return index + 1;
    }
  }

  return source.length;
}

function parseArrowParameterList(source, startIndex) {
  if (source[startIndex] !== '(') {
    return null;
  }

  const closeIndex = findMatchingDelimiter(source, startIndex, '(', ')');
  if (closeIndex === -1) {
    return null;
  }

  const arrowIndex = nextNonWhitespaceIndex(source, closeIndex + 1);
  if (source.slice(arrowIndex, arrowIndex + 2) !== '=>') {
    return null;
  }

  return {
    raw: source.slice(startIndex, arrowIndex + 2),
    endIndex: arrowIndex + 2,
    bindings: extractBindingsFromParameterList(source.slice(startIndex + 1, closeIndex))
  };
}

function parseFunctionHeader(source, startIndex, scopes) {
  if (!/^function\b/.test(source.slice(startIndex))) {
    return null;
  }

  let cursor = startIndex + 'function'.length;
  cursor = nextNonWhitespaceIndex(source, cursor);
  if (source[cursor] === '*') {
    cursor = nextNonWhitespaceIndex(source, cursor + 1);
  }

  let functionName = '';
  const maybeName = readIdentifier(source, cursor);
  if (maybeName) {
    functionName = maybeName.name;
    cursor = nextNonWhitespaceIndex(source, maybeName.endIndex);
  }

  if (source[cursor] !== '(') {
    return null;
  }

  const closeIndex = findMatchingDelimiter(source, cursor, '(', ')');
  if (closeIndex === -1) {
    return null;
  }

  const previous = previousSignificantCharacter(source, startIndex);
  if (functionName && !['=', '(', ',', ':'].includes(previous)) {
    addBindingsToScope(nearestFunctionScope(scopes), [functionName]);
  }

  const scope = createExpressionScope('function');
  addBindingsToScope(scope, [functionName, ...extractBindingsFromParameterList(source.slice(cursor + 1, closeIndex))]);

  return {
    raw: source.slice(startIndex, closeIndex + 1),
    endIndex: closeIndex + 1,
    scope
  };
}

function parseCatchHeader(source, startIndex) {
  if (!/^catch\b/.test(source.slice(startIndex))) {
    return null;
  }

  if (previousSignificantCharacter(source, startIndex) !== '}') {
    return null;
  }

  let cursor = nextNonWhitespaceIndex(source, startIndex + 'catch'.length);
  if (source[cursor] !== '(') {
    return null;
  }

  const closeIndex = findMatchingDelimiter(source, cursor, '(', ')');
  if (closeIndex === -1) {
    return null;
  }

  const scope = createExpressionScope('block');
  addBindingsToScope(scope, extractBindingsFromPattern(source.slice(cursor + 1, closeIndex)));

  return {
    raw: source.slice(startIndex, closeIndex + 1),
    endIndex: closeIndex + 1,
    scope
  };
}

function parseVariableDeclaration(source, startIndex, keyword, scopes) {
  const endIndex = findStatementBoundary(source, startIndex + keyword.length);
  const raw = source.slice(startIndex, endIndex);
  const body = raw
    .replace(new RegExp(`^${keyword}\\b`), '')
    .replace(/;$/, '')
    .trim();

  const bindings = splitTopLevelArguments(body)
    .flatMap((entry) => extractBindingsFromPattern(stripTopLevelInitializer(entry)));

  const targetScope = keyword === 'var'
    ? nearestFunctionScope(scopes)
    : scopes[scopes.length - 1];
  addBindingsToScope(targetScope, bindings);

  return {
    raw,
    endIndex
  };
}

function establishArrowScope(bindings, expression, bodyStartIndex, scopes, pendingScopes, state) {
  const scope = createExpressionScope('function');
  addBindingsToScope(scope, bindings);

  const nextIndex = nextNonWhitespaceIndex(expression, bodyStartIndex);
  if (expression[nextIndex] === '{') {
    pendingScopes.push(scope);
    return;
  }

  scope.concise = {
    parenDepth: state.parenDepth,
    bracketDepth: state.bracketDepth,
    braceDepth: state.braceDepth
  };
  scopes.push(scope);
}

function closeCompletedConciseScopes(scopes, char, state) {
  while (scopes.length > 1) {
    const scope = scopes[scopes.length - 1];
    const concise = scope.concise;
    if (!concise) {
      return;
    }

    const sameDepth = concise.parenDepth === state.parenDepth
      && concise.bracketDepth === state.bracketDepth
      && concise.braceDepth === state.braceDepth;
    if (!sameDepth || !',;)]}'.includes(char)) {
      return;
    }

    scopes.pop();
  }
}

function shouldPreserveIdentifier(expression, identifier, startIndex, endIndex, scopes) {
  const previous = previousSignificantCharacter(expression, startIndex);
  const next = nextSignificantCharacter(expression, endIndex);

  if (previous === '.' || previous === '$') {
    return true;
  }

  if (hasLocalBinding(scopes, identifier)) {
    return true;
  }

  if (JAVASCRIPT_RESERVED_WORDS.has(identifier)) {
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
  let lineComment = false;
  let blockComment = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  const scopes = [createExpressionScope('function')];
  const pendingScopes = [];

  while (index < expression.length) {
    const char = expression[index];
    const next = expression[index + 1] ?? '';

    closeCompletedConciseScopes(scopes, char, { parenDepth, bracketDepth, braceDepth });

    if (lineComment) {
      output += char;
      if (char === '\n') {
        lineComment = false;
      }
      index += 1;
      continue;
    }

    if (blockComment) {
      output += char;
      if (char === '*' && next === '/') {
        output += next;
        blockComment = false;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (!quote && char === '/' && next === '/') {
      output += '//';
      lineComment = true;
      index += 2;
      continue;
    }

    if (!quote && char === '/' && next === '*') {
      output += '/*';
      blockComment = true;
      index += 2;
      continue;
    }

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

    if (char === '(') {
      const arrowParams = parseArrowParameterList(expression, index);
      if (arrowParams) {
        output += arrowParams.raw;
        establishArrowScope(arrowParams.bindings, expression, arrowParams.endIndex, scopes, pendingScopes, {
          parenDepth,
          bracketDepth,
          braceDepth
        });
        index = arrowParams.endIndex;
        continue;
      }

      parenDepth += 1;
      output += char;
      index += 1;
      continue;
    }

    if (char === ')') {
      parenDepth -= 1;
      output += char;
      index += 1;
      continue;
    }

    if (char === '[') {
      bracketDepth += 1;
      output += char;
      index += 1;
      continue;
    }

    if (char === ']') {
      bracketDepth -= 1;
      output += char;
      index += 1;
      continue;
    }

    if (char === '{') {
      braceDepth += 1;
      output += char;
      scopes.push(pendingScopes.pop() ?? createExpressionScope('block'));
      index += 1;
      continue;
    }

    if (char === '}') {
      braceDepth -= 1;
      output += char;
      if (scopes.length > 1) {
        scopes.pop();
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

    if (isIdentifierStart(char)) {
      const token = readIdentifier(expression, index);
      const identifier = token?.name ?? '';
      const endIndex = token?.endIndex ?? index + 1;

      if (identifier === 'function') {
        const header = parseFunctionHeader(expression, index, scopes);
        if (header) {
          output += header.raw;
          pendingScopes.push(header.scope);
          index = header.endIndex;
          continue;
        }
      }

      if (identifier === 'catch') {
        const catchHeader = parseCatchHeader(expression, index);
        if (catchHeader) {
          output += catchHeader.raw;
          pendingScopes.push(catchHeader.scope);
          index = catchHeader.endIndex;
          continue;
        }
      }

      if (identifier === 'const' || identifier === 'let' || identifier === 'var') {
        const declaration = parseVariableDeclaration(expression, index, identifier, scopes);
        output += declaration.raw;
        index = declaration.endIndex;
        continue;
      }

      const arrowIndex = nextNonWhitespaceIndex(expression, endIndex);
      if (expression.slice(arrowIndex, arrowIndex + 2) === '=>') {
        output += identifier;
        output += expression.slice(endIndex, arrowIndex + 2);
        establishArrowScope([identifier], expression, arrowIndex + 2, scopes, pendingScopes, {
          parenDepth,
          bracketDepth,
          braceDepth
        });
        index = arrowIndex + 2;
        continue;
      }

      if (shouldPreserveIdentifier(expression, identifier, index, endIndex, scopes)) {
        output += identifier;
      } else if (FRAMEWORK_SCOPE_GLOBALS.has(identifier)) {
        const helper = FRAMEWORK_SCOPE_GLOBALS.get(identifier);
        output += options.eventContext && helper.eventRuntimeTarget
          ? helper.eventRuntimeTarget
          : helper.runtimeTarget;
      } else if (FRAMEWORK_HELPERS.has(identifier)) {
        const helper = FRAMEWORK_HELPERS.get(identifier);
        const next = nextSignificantCharacter(expression, endIndex);
        if (helper.nativeAction && next === '(' && !options.disableNativeTransportActions) {
          output += helper.nativeAction;
        } else if (identifier === 'mutate' && options.eventContext) {
          output += 'mutate';
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

  while (scopes.length > 1 && scopes[scopes.length - 1].concise) {
    scopes.pop();
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

function transformCalcExpression(expression) {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return transformDatastarExpression(expression, { disableNativeTransportActions: true });
  }
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) {
    return expression;
  }
  const entries = splitTopLevelArguments(inner);
  const transformed = entries.map((entry) => {
    const colonIndex = entry.indexOf(':');
    if (colonIndex === -1) {
      return entry;
    }
    const key = entry.slice(0, colonIndex).trim();
    const value = entry.slice(colonIndex + 1).trim();
    return `${key}: () => (${transformDatastarExpression(value, { disableNativeTransportActions: true })})`;
  });
  return `{ ${transformed.join(', ')} }`;
}

function transformEachExpression(expression) {
  const inMatch = expression.match(/^(.+?)\s+in\s+(.+)$/);
  if (!inMatch) {
    return expression;
  }
  const vars = inMatch[1].trim();
  const source = inMatch[2].trim();
  return `${vars} in ${transformDatastarExpression(source)}`;
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
      const statusDirective = compileFrameworkStatusDirective(rule.name, expression);
      if (statusDirective) {
        return statusDirective;
      }
      if (rule.name === 'calc') {
        return appendAttribute('', rule.datastarAttribute, transformCalcExpression(expression));
      }
      if (rule.name === 'bind') {
        return appendAttribute('', rule.datastarAttribute, transformDatastarExpression(expression, { bindName: true }));
      }
      if (rule.datastarAttribute) {
        return appendAttribute('', rule.datastarAttribute, transformDatastarExpression(expression));
      }
      if (rule.name === 'if' || rule.name === 'html' || rule.name === 'props') {
        return appendAttribute('', rule.frameworkAttribute, transformDatastarExpression(expression));
      }
      if (rule.name === 'each') {
        return appendAttribute('', rule.frameworkAttribute, transformEachExpression(expression));
      }
      if (rule.name === 'use') {
        return appendAttribute('', rule.frameworkAttribute, expression);
      }
      return appendAttribute('', rule.frameworkAttribute, unwrapQuotedString(expression) ?? expression);
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
      const args = splitTopLevelArguments(rawArgs).map((arg) => transformDatastarExpression(arg, { eventContext: true }));
      return {
        attribute: `data-on:${eventName}`,
        value: `window.BracketsRuntime.callAction("${actionName}", [${args.join(', ')}], evt, el)`,
        framework: false
      };
    }
  }

  return {
    attribute: `data-on:${eventName}`,
    value: transformDatastarExpression(trimmed, { eventContext: true }),
    framework: false
  };
}

function applyEventSyntax(attributes, tagName) {
  return attributes.replace(/\s@([A-Za-z][\w:-]*)\s*=\s*"([^"]*)"/g, (_, eventName, expression) => {
    const transformed = transformEventExpression(expression, eventName, tagName);
    if (transformed.framework) {
        return appendAttribute('', `data-b-on:${eventName}`, transformed.value);
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
