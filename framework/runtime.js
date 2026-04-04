let frameworkConfig = readJsonScript('brackets-config', {});
let embeddedHost = readJsonScript('brackets-host', {});
let datastarModulePromise = null;
let appContractPromise = null;
let activeLogic = null;
let activeRoute = null;
let activeCleanups = [];
let dataNamespace = {};
let apiNamespace = {};
let sessionState = { authenticated: false, user: null };
let starterMarkup = '';
let starterTitle = document.title;
let currentShell = 'starter';
let resolvedAppContract = null;
const frameworkCache = new Map();
const routeRenderCache = new Map();
const requestStateCache = new Map();
const frameworkCacheGenerations = new Map();
const routeCacheGenerations = new Map();
const liveReadStreams = new Map();
let routerHooksPromise = null;
let routerHooksState = {
  beforeEach: null,
  afterEach: null,
  notFound: null
};
let frameworkDirectiveScheduled = false;
let frameworkDirectiveRunning = false;
let frameworkDirectiveObserver = null;
const frameworkTemplateCache = new Map();
const routeTableCache = new WeakMap();
let datastarRuntime = null;
let requestSequence = 0;
let navigationSequence = 0;
let cacheSequence = 0;
let sessionRequestPromise = null;
let sessionFetchedAt = 0;
const MAX_NAVIGATION_REDIRECTS = 12;
const FRAMEWORK_TEMPLATE_CACHE_TTL_MS = 1000;
const FRAMEWORK_DIRECTIVE_MAX_PASSES = 8;
const ROUTE_RENDER_CACHE_TTL_MS = 1000;
const SESSION_CACHE_TTL_MS = 5000;
let routePreloadsStarted = false;

function readJsonScript(id, fallback = null) {
  const element = document.getElementById(id);
  if (!element?.textContent) {
    return fallback;
  }

  try {
    return JSON.parse(element.textContent);
  } catch {
    return fallback;
  }
}

function readMetaContent(name) {
  const element = document.querySelector(`meta[name="${String(name ?? '')}"]`);
  return String(element?.getAttribute('content') ?? '').trim();
}

function setMetaContent(name, value) {
  const element = document.querySelector(`meta[name="${String(name ?? '')}"]`);
  if (element) {
    element.setAttribute('content', String(value ?? ''));
  }
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = String(value ?? '');
  }
}

function setDataState(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.dataset.state = value;
  }
}

function setHealthBar(widthPercent) {
  const fill = document.querySelector('[data-brx-health-fill]');
  if (fill) {
    fill.style.width = `${Math.max(8, Math.min(100, Math.round(widthPercent)))}%`;
  }
}

function buildNetworkLabel(host) {
  const networkOrigins = host?.addresses?.networkOrigins ?? [];
  return networkOrigins[0] ?? 'Not exposed yet';
}

function hostSummary(host) {
  return `${host?.runtime ?? 'embedded'} / ${host?.engine ?? 'deno'}`;
}

function modeSummary(host) {
  return `${host?.mode ?? 'dynamic'} / same-origin`;
}

function classifyHealth(latency, config) {
  const health = config?.health ?? {};
  const warn = Number(health.hostWarnMs ?? 420);
  const fail = Number(health.hostFailMs ?? 850);

  if (!Number.isFinite(latency)) {
    return {
      state: 'checking',
      label: 'checking',
      summary: 'Measuring the app now.',
      reasons: ['Waiting for the first response.'],
      score: 40
    };
  }

  if (latency >= fail) {
    return {
      state: 'red',
      label: 'needs attention',
      summary: 'Brackets needs attention before you keep building.',
      reasons: [`The host took ${latency}ms to respond, which is slower than the current target.`],
      score: 18
    };
  }

  if (latency >= warn) {
    return {
      state: 'yellow',
      label: 'running ok',
      summary: 'Brackets is running, but something looks slower than normal.',
      reasons: [`The host responded in ${latency}ms. It is working, but it is not in the green yet.`],
      score: 54
    };
  }

  return {
    state: 'green',
    label: 'green',
    summary: 'Everything is responding normally.',
    reasons: [`The host responded in ${latency}ms and the framework is running cleanly.`],
    score: 100 - Math.min(70, latency / 6)
  };
}

async function probeHost(config) {
  const start = performance.now();
  const response = await fetch('/__brackets/host', {
    headers: {
      Accept: 'application/json'
    },
    cache: 'no-store'
  });
  const latency = Math.max(1, Math.round(performance.now() - start));

  if (!response.ok) {
    throw new Error(`Host probe failed with ${response.status}`);
  }

  const host = await response.json();
  const result = classifyHealth(latency, config);
  return { latency, host, result };
}

function updateShellStatus(state, label) {
  const light = document.querySelector('[data-brx-shell-light]');
  const text = document.querySelector('[data-brx-shell-text]');

  if (light) {
    light.dataset.state = state;
  }
  if (text) {
    text.textContent = label;
  }
}

function renderHealth({ latency, host, result }) {
  setDataState('[data-brx-health-light]', result.state);
  setDataState('[data-brx-health-meter]', result.state);
  setText('[data-brx-health-summary]', result.summary);
  setText('[data-brx-health-latency]', `${latency}ms`);
  setText('[data-brx-health-runtime]', hostSummary(host));
  setText('[data-brx-health-mode]', modeSummary(host));
  setText('[data-brx-local-origin]', host?.addresses?.localOrigin ?? host?.origin ?? window.location.origin);
  setText('[data-brx-network-origin]', buildNetworkLabel(host));
  updateShellStatus(result.state, result.label);
  setHealthBar(result.score);

  const reasons = document.querySelector('[data-brx-health-reasons]');
  if (reasons) {
    reasons.innerHTML = '';
    for (const reason of result.reasons) {
      const item = document.createElement('li');
      item.textContent = reason;
      reasons.append(item);
    }
  }
}

function renderFrameworkError(message) {
  const result = {
    state: 'red',
    label: 'needs attention',
    summary: 'The framework host is not responding correctly.',
    reasons: [message],
    score: 12
  };

  setDataState('[data-brx-health-light]', result.state);
  setDataState('[data-brx-health-meter]', result.state);
  setText('[data-brx-health-summary]', result.summary);
  setText('[data-brx-health-latency]', 'error');
  setText('[data-brx-health-runtime]', 'unavailable');
  setText('[data-brx-health-mode]', 'check host');
  updateShellStatus(result.state, result.label);
  setHealthBar(result.score);

  const reasons = document.querySelector('[data-brx-health-reasons]');
  if (reasons) {
    reasons.innerHTML = '';
    const item = document.createElement('li');
    item.textContent = message;
    reasons.append(item);
  }
}

async function refreshHealth(config) {
  try {
    const payload = await probeHost(config);
    embeddedHost = payload.host;
    if (window.BracketsRuntime) {
      window.BracketsRuntime.host = payload.host;
    }
    renderHealth(payload);
  } catch (error) {
    renderFrameworkError(String(error?.message ?? error));
  }
}

function routePathOnly(value) {
  const url = new URL(value, window.location.origin);
  return url.pathname;
}

function normalizePath(value) {
  if (!value) {
    return '/';
  }
  return routePathOnly(value) === '/index.html' ? '/' : routePathOnly(value);
}

function safeJsonSignals(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

function escapeSelectorValue(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(String(value ?? ''));
  }
  return String(value ?? '').replace(/["\\]/g, '\\$&');
}

function tokenizeFrameworkExpression(source) {
  const input = String(source ?? '');
  const tokens = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const operator = ['===', '!==', '&&', '||', '??', '>=', '<=', '==', '!='].find((candidate) => input.startsWith(candidate, index));
    if (operator) {
      tokens.push({ type: 'operator', value: operator });
      index += operator.length;
      continue;
    }

    if ('(){}[]?:,.-+*/%!<>'.includes(char)) {
      tokens.push({ type: 'punctuation', value: char });
      index += 1;
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      const quote = char;
      let value = '';
      index += 1;
      while (index < input.length) {
        const next = input[index];
        if (next === '\\') {
          value += input[index + 1] ?? '';
          index += 2;
          continue;
        }
        if (next === quote) {
          index += 1;
          break;
        }
        value += next;
        index += 1;
      }
      tokens.push({ type: 'string', value });
      continue;
    }

    if (/\d/.test(char)) {
      let end = index + 1;
      while (end < input.length && /[\d.]/.test(input[end])) {
        end += 1;
      }
      tokens.push({ type: 'number', value: Number(input.slice(index, end)) });
      index = end;
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      let end = index + 1;
      while (end < input.length && /[A-Za-z0-9_$]/.test(input[end])) {
        end += 1;
      }
      tokens.push({ type: 'identifier', value: input.slice(index, end) });
      index = end;
      continue;
    }

    throw new Error(`Unsupported Brackets expression token near "${input.slice(index, index + 12)}".`);
  }

  return tokens;
}

function parseFrameworkExpression(source) {
  const tokens = tokenizeFrameworkExpression(source);
  let index = 0;

  function peek(...values) {
    const token = tokens[index];
    if (!token) {
      return false;
    }
    return values.length ? values.includes(token.value) : true;
  }

  function consumeValue(value) {
    const token = tokens[index];
    if (!token || token.value !== value) {
      throw new Error(`Expected "${value}" in Brackets expression.`);
    }
    index += 1;
    return token;
  }

  function consumeType(type) {
    const token = tokens[index];
    if (!token || token.type !== type) {
      throw new Error(`Expected ${type} in Brackets expression.`);
    }
    index += 1;
    return token;
  }

  function parsePrimary() {
    const token = tokens[index];
    if (!token) {
      return { type: 'literal', value: undefined };
    }

    if (token.type === 'number' || token.type === 'string') {
      index += 1;
      return { type: 'literal', value: token.value };
    }

    if (token.type === 'identifier') {
      index += 1;
      if (token.value === 'true' || token.value === 'false' || token.value === 'null' || token.value === 'undefined') {
        return {
          type: 'literal',
          value: token.value === 'true'
            ? true
            : token.value === 'false'
              ? false
              : token.value === 'null'
                ? null
                : undefined
        };
      }
      return { type: 'identifier', name: token.value };
    }

    if (token.value === '(') {
      consumeValue('(');
      const expression = parseTernary();
      consumeValue(')');
      return expression;
    }

    if (token.value === '[') {
      consumeValue('[');
      const elements = [];
      while (!peek(']')) {
        elements.push(parseTernary());
        if (peek(',')) {
          consumeValue(',');
          continue;
        }
        break;
      }
      consumeValue(']');
      return { type: 'array', elements };
    }

    if (token.value === '{') {
      consumeValue('{');
      const properties = [];
      while (!peek('}')) {
        const keyToken = tokens[index];
        let key = '';
        if (keyToken?.type === 'identifier') {
          key = consumeType('identifier').value;
        } else if (keyToken?.type === 'string') {
          key = consumeType('string').value;
        } else {
          throw new Error('Expected object key in Brackets expression.');
        }

        let value;
        if (peek(':')) {
          consumeValue(':');
          value = parseTernary();
        } else {
          value = { type: 'identifier', name: key };
        }

        properties.push({ key, value });
        if (peek(',')) {
          consumeValue(',');
          continue;
        }
        break;
      }
      consumeValue('}');
      return { type: 'object', properties };
    }

    throw new Error(`Unsupported Brackets expression near "${token.value}".`);
  }

  function parseMember() {
    let node = parsePrimary();
    while (index < tokens.length) {
      if (peek('.')) {
        consumeValue('.');
        node = {
          type: 'member',
          object: node,
          property: consumeType('identifier').value,
          computed: false
        };
        continue;
      }

      if (peek('[')) {
        consumeValue('[');
        node = {
          type: 'member',
          object: node,
          property: parseTernary(),
          computed: true
        };
        consumeValue(']');
        continue;
      }

      if (peek('(')) {
        consumeValue('(');
        const args = [];
        while (!peek(')')) {
          args.push(parseTernary());
          if (peek(',')) {
            consumeValue(',');
            continue;
          }
          break;
        }
        consumeValue(')');
        node = {
          type: 'call',
          callee: node,
          args
        };
        continue;
      }

      break;
    }
    return node;
  }

  function parseUnary() {
    if (peek('!', '+', '-')) {
      const operator = tokens[index].value;
      index += 1;
      return {
        type: 'unary',
        operator,
        argument: parseUnary()
      };
    }
    return parseMember();
  }

  function parseBinary(nextParser, operators) {
    let left = nextParser();
    while (peek(...operators)) {
      const operator = tokens[index].value;
      index += 1;
      left = {
        type: 'binary',
        operator,
        left,
        right: nextParser()
      };
    }
    return left;
  }

  function parseMultiplicative() {
    return parseBinary(parseUnary, ['*', '/', '%']);
  }

  function parseAdditive() {
    return parseBinary(parseMultiplicative, ['+', '-']);
  }

  function parseComparison() {
    return parseBinary(parseAdditive, ['>', '<', '>=', '<=']);
  }

  function parseEquality() {
    return parseBinary(parseComparison, ['===', '!==', '==', '!=']);
  }

  function parseNullish() {
    return parseBinary(parseEquality, ['??']);
  }

  function parseAnd() {
    return parseBinary(parseNullish, ['&&']);
  }

  function parseOr() {
    return parseBinary(parseAnd, ['||']);
  }

  function parseTernary() {
    const test = parseOr();
    if (!peek('?')) {
      return test;
    }
    consumeValue('?');
    const consequent = parseTernary();
    consumeValue(':');
    const alternate = parseTernary();
    return {
      type: 'ternary',
      test,
      consequent,
      alternate
    };
  }

  const ast = parseTernary();
  if (index < tokens.length) {
    throw new Error(`Unexpected token "${tokens[index].value}" in Brackets expression.`);
  }
  return ast;
}

function evaluateFrameworkExpression(source, scope) {
  const ast = parseFrameworkExpression(source);
  const globals = {
    route: scope.route,
    nav: scope.nav,
    auth: scope.auth,
    requestState: scope.requestState,
    config: scope.config,
    host: scope.host,
    session: scope.session,
    self: scope.self,
    parent: scope.parent,
    children: scope.children,
    root: scope.root,
    props: scope.props,
    event: scope.event ?? null,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Date,
    Intl
  };
  const reservedGlobals = new Set([
    'route',
    'nav',
    'auth',
    'requestState',
    'config',
    'host',
    'session',
    'self',
    'parent',
    'children',
    'root',
    'props',
    'event'
  ]);

  function resolveIdentifier(name) {
    if (reservedGlobals.has(name) && Object.prototype.hasOwnProperty.call(globals, name)) {
      return globals[name];
    }

    if (Object.prototype.hasOwnProperty.call(scope.locals, name)) {
      return scope.locals[name];
    }

    if (Object.prototype.hasOwnProperty.call(globals, name)) {
      return globals[name];
    }

    try {
      const value = scope.datastar?.getPath?.(name);
      if (value !== undefined) {
        return value;
      }
    } catch {
      // no-op
    }

    if (scope.datastar?.root && Object.prototype.hasOwnProperty.call(scope.datastar.root, name)) {
      return scope.datastar.root[name];
    }

    return undefined;
  }

  function getMemberTarget(node) {
    const object = visit(node.object);
    const property = node.computed ? visit(node.property) : node.property;
    return {
      object,
      property
    };
  }

  function visit(node) {
    switch (node?.type) {
      case 'literal':
        return node.value;
      case 'identifier':
        return resolveIdentifier(node.name);
      case 'array':
        return node.elements.map(visit);
      case 'object':
        return Object.fromEntries(node.properties.map((property) => [property.key, visit(property.value)]));
      case 'member': {
        const { object, property } = getMemberTarget(node);
        if (object === null || object === undefined) {
          return undefined;
        }
        return object[property];
      }
      case 'call': {
        if (node.callee.type === 'member') {
          const { object, property } = getMemberTarget(node.callee);
          const fn = object?.[property];
          if (typeof fn !== 'function') {
            return undefined;
          }
          return fn.apply(object, node.args.map(visit));
        }
        const fn = visit(node.callee);
        if (typeof fn !== 'function') {
          return undefined;
        }
        return fn(...node.args.map(visit));
      }
      case 'unary': {
        const value = visit(node.argument);
        if (node.operator === '!') {
          return !value;
        }
        if (node.operator === '+') {
          return +value;
        }
        if (node.operator === '-') {
          return -value;
        }
        return value;
      }
      case 'binary': {
        const left = visit(node.left);
        const right = visit(node.right);
        switch (node.operator) {
          case '||': return left || right;
          case '&&': return left && right;
          case '??': return left ?? right;
          case '===': return left === right;
          case '!==': return left !== right;
          case '==': return left == right;
          case '!=': return left != right;
          case '>': return left > right;
          case '<': return left < right;
          case '>=': return left >= right;
          case '<=': return left <= right;
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/': return left / right;
          case '%': return left % right;
          default: return undefined;
        }
      }
      case 'ternary':
        return visit(node.test) ? visit(node.consequent) : visit(node.alternate);
      default:
        return undefined;
    }
  }

  return visit(ast);
}

function baseFrameworkScope(datastar, locals = {}, overrides = {}) {
  return {
    locals,
    datastar,
    route: currentRouteState(),
    nav: runtimeNav(),
    auth: createAuthApi(),
    requestState: requestStateApi(),
    config: frameworkConfig,
    host: embeddedHost,
    session: sessionState,
    self: locals,
    parent: null,
    children: [],
    root: locals,
    props: {},
    event: null,
    ...overrides
  };
}

function frameworkScopeFramesFor(element, datastar) {
  const lineage = [];
  let current = element;
  while (current) {
    lineage.unshift(current);
    current = current.parentElement;
  }

  const locals = {};
  const frames = [];
  for (const node of lineage) {
    const signalExpression = node.getAttribute?.('data-signals');
    if (signalExpression) {
      try {
        const value = evaluateFrameworkExpression(signalExpression, baseFrameworkScope(datastar, locals));
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const nextValue = { ...value };
          frames.push({
            element: node,
            kind: 'signals',
            value: nextValue
          });
          Object.assign(locals, nextValue);
        }
      } catch {
        // Datastar-native scopes may contain expressions the framework layer does not own.
      }
    }

    if (node.__bScope && typeof node.__bScope === 'object' && !Array.isArray(node.__bScope)) {
      const nextValue = { ...node.__bScope };
      frames.push({
        element: node,
        kind: 'props',
        value: nextValue
      });
      Object.assign(locals, nextValue);
    }
  }

  return {
    frames,
    locals
  };
}

function frameworkScopeValue(frames, element) {
  if (!element) {
    return {};
  }

  const values = frames
    .filter((frame) => frame.element === element)
    .map((frame) => frame.value)
    .filter((value) => value && typeof value === 'object' && !Array.isArray(value));
  return values.length ? Object.assign({}, ...values) : {};
}

function frameworkScopeElements(frames) {
  const seen = new Set();
  const elements = [];
  for (const frame of frames) {
    if (!frame.element || seen.has(frame.element)) {
      continue;
    }
    seen.add(frame.element);
    elements.push(frame.element);
  }
  return elements;
}

function directFrameworkChildElements(scopeElement, scopedElements) {
  if (!scopeElement) {
    return [];
  }

  const scopeSet = new Set(scopedElements);
  return scopedElements.filter((candidate) => {
    if (candidate === scopeElement) {
      return false;
    }

    let current = candidate.parentElement;
    while (current) {
      if (scopeSet.has(current)) {
        return current === scopeElement;
      }
      current = current.parentElement;
    }

    return false;
  });
}

function buildFrameworkScope(element, datastar, event = null) {
  const { frames, locals } = frameworkScopeFramesFor(element, datastar);
  const scopedElements = frameworkScopeElements(frames);
  const selfElement = scopedElements.at(-1) ?? null;
  const parentElement = scopedElements.length > 1 ? scopedElements.at(-2) : null;
  const rootElement = scopedElements[0] ?? selfElement;
  const currentProps = [...frames].reverse().find((frame) => frame.kind === 'props' && frame.element === selfElement)
    ?? [...frames].reverse().find((frame) => frame.kind === 'props')
    ?? null;
  const selfValue = frameworkScopeValue(frames, selfElement);
  const parentValue = frameworkScopeValue(frames, parentElement);
  const rootValue = frameworkScopeValue(frames, rootElement);
  const children = directFrameworkChildElements(selfElement, scopedElements)
    .map((childElement) => frameworkScopeValue(frames, childElement))
    .filter((value) => Object.keys(value).length > 0);

  return baseFrameworkScope(datastar, locals, {
    self: Object.keys(selfValue).length ? selfValue : { ...locals },
    parent: Object.keys(parentValue).length ? parentValue : null,
    children,
    root: Object.keys(rootValue).length ? rootValue : { ...locals },
    props: currentProps?.value ?? {},
    event
  });
}

function sanitizeFrameworkHtml(source) {
  const template = document.createElement('template');
  template.innerHTML = String(source ?? '');
  const blockedTags = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED']);
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const removals = [];

  while (walker.nextNode()) {
    const element = walker.currentNode;
    if (blockedTags.has(element.tagName)) {
      removals.push(element);
      continue;
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (['href', 'src', 'xlink:href', 'formaction'].includes(name) && /^javascript:/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  for (const element of removals) {
    element.remove();
  }

  return template.innerHTML;
}

function parseEachDirective(expression) {
  const match = String(expression ?? '').trim().match(/^(?:\(\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*))?\s*\)|([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?)\s+in\s+([\s\S]+)$/);
  if (!match) {
    throw new Error(`Invalid Brackets :each expression: ${expression}`);
  }

  const itemName = match[1] ?? match[3];
  const indexName = match[2] ?? match[4] ?? '$index';
  const sourceExpression = match[5];
  return {
    itemName,
    indexName,
    sourceExpression
  };
}

function normalizeCollection(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, entry]) => ({ key, value: entry }));
  }
  return [];
}

async function fetchFrameworkTemplate(reference, fromRelativePath = '') {
  const cacheKey = `${fromRelativePath}::${reference}`;
  const cached = frameworkTemplateCache.get(cacheKey);
  if (cached?.value && (Date.now() - cached.at) <= FRAMEWORK_TEMPLATE_CACHE_TTL_MS) {
    return cached.value;
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const url = new URL('/__brackets/template', window.location.origin);
  url.searchParams.set('ref', String(reference));
  if (fromRelativePath) {
    url.searchParams.set('from', fromRelativePath);
  }

  const promise = fetch(url, {
    headers: {
      Accept: 'application/json'
    },
    cache: 'no-store'
  }).then(async (response) => {
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.error ?? `Unable to resolve template ${reference}`);
    }
    frameworkTemplateCache.set(cacheKey, {
      value: payload,
      at: Date.now()
    });
    return payload;
  }).catch((error) => {
    if (cached?.value) {
      frameworkTemplateCache.set(cacheKey, cached);
    } else {
      frameworkTemplateCache.delete(cacheKey);
    }
    throw error;
  });

  frameworkTemplateCache.set(cacheKey, {
    ...(cached ?? {}),
    promise,
    at: cached?.at ?? 0,
    value: cached?.value
  });
  return promise;
}

function applyFillTargets(root) {
  let changed = false;
  const fills = [...root.querySelectorAll('[data-b-fill]')];
  for (const fill of fills) {
    const name = fill.getAttribute('data-b-fill');
    if (!name) {
      continue;
    }
    const target = root.querySelector(`[data-b-area="${escapeSelectorValue(name)}"]`);
    if (!target || target.contains(fill)) {
      continue;
    }
    const markup = fill.tagName === 'TEMPLATE' ? fill.innerHTML : fill.innerHTML;
    if (target.innerHTML !== markup) {
      target.innerHTML = markup;
      changed = true;
    }
    fill.replaceWith(document.createComment(`fill:${name}`));
    changed = true;
  }
  return changed;
}

function ensureTemplateAnchors(element, key) {
  const startKey = `__${key}Start`;
  const endKey = `__${key}End`;
  if (element[startKey] && element[endKey]) {
    return {
      start: element[startKey],
      end: element[endKey]
    };
  }

  const start = document.createComment(`${key}:start`);
  const end = document.createComment(`${key}:end`);
  element.before(start);
  element.after(end);
  element.remove();
  element[startKey] = start;
  element[endKey] = end;
  element.__bTemplateSource = element.innerHTML;
  return { start, end };
}

function clearBetween(start, end) {
  let current = start.nextSibling;
  while (current && current !== end) {
    const next = current.nextSibling;
    current.remove();
    current = next;
  }
}

function insertMarkupBetween(start, end, html, scopeEntries = []) {
  const fragmentTemplate = document.createElement('template');
  fragmentTemplate.innerHTML = html;

  if (scopeEntries.length) {
    const host = document.createElement('div');
    host.style.display = 'contents';
    host.__bScope = Object.assign({}, ...scopeEntries);
    host.setAttribute('data-signals', safeJsonSignals(host.__bScope));
    host.append(fragmentTemplate.content.cloneNode(true));
    end.before(host);
    return;
  }

  end.before(fragmentTemplate.content.cloneNode(true));
}

function renderFrameworkIf(root, datastar) {
  let changed = false;
  const nodes = [...root.querySelectorAll('[data-b-if], template[data-b-if]')];
  for (const element of nodes) {
    const expression = element.getAttribute('data-b-if');
    if (!expression) {
      continue;
    }
    const visible = Boolean(evaluateFrameworkExpression(expression, buildFrameworkScope(element, datastar)));

    if (element.tagName === 'TEMPLATE') {
      const anchors = ensureTemplateAnchors(element, 'bIf');
      const markup = visible ? element.__bTemplateSource ?? '' : '';
      const nextSignature = `${visible}:${markup}`;
      if (element.__bIfSignature === nextSignature) {
        continue;
      }
      clearBetween(anchors.start, anchors.end);
      if (visible && markup) {
        insertMarkupBetween(anchors.start, anchors.end, markup);
      }
      element.__bIfSignature = nextSignature;
      changed = true;
      continue;
    }

    const nextHidden = !visible;
    if (element.hidden !== nextHidden) {
      element.hidden = nextHidden;
      changed = true;
    }
  }
  return changed;
}

function renderFrameworkEach(root, datastar) {
  let changed = false;
  const templates = [...root.querySelectorAll('template[data-b-each]')];
  for (const element of templates) {
    const directive = parseEachDirective(element.getAttribute('data-b-each'));
    const collection = normalizeCollection(evaluateFrameworkExpression(directive.sourceExpression, buildFrameworkScope(element, datastar)));
    const anchors = ensureTemplateAnchors(element, 'bEach');
    const signature = safeJsonSignals({
      directive: element.getAttribute('data-b-each') ?? '',
      template: element.__bTemplateSource ?? '',
      collection
    });
    if (element.__bEachSignature === signature) {
      continue;
    }

    clearBetween(anchors.start, anchors.end);
    for (const [index, item] of collection.entries()) {
      const scope = {
        [directive.itemName]: item,
        [directive.indexName]: index
      };
      insertMarkupBetween(anchors.start, anchors.end, element.__bTemplateSource ?? '', [scope]);
    }
    element.__bEachSignature = signature;
    changed = true;
  }
  return changed;
}

async function renderFrameworkUse(root, datastar) {
  let changed = false;
  const nodes = [...root.querySelectorAll('[data-b-use]')];
  for (const element of nodes) {
    const useExpression = element.getAttribute('data-b-use');
    if (!useExpression) {
      continue;
    }

    const scope = buildFrameworkScope(element, datastar);
    const reference = evaluateFrameworkExpression(useExpression, scope);
    if (!reference) {
      continue;
    }

    const propsExpression = element.getAttribute('data-b-props');
    const props = propsExpression
      ? evaluateFrameworkExpression(propsExpression, scope)
      : {};
    const fillsSource = element.__bUseSourceHtml ?? element.innerHTML;
    element.__bUseSourceHtml = fillsSource;
    const fillTemplate = document.createElement('template');
    fillTemplate.innerHTML = fillsSource;

    const requestToken = Number(element.__bUseRequestToken ?? 0) + 1;
    element.__bUseRequestToken = requestToken;
    const templatePayload = await fetchFrameworkTemplate(reference, activeRoute?.htmlPath?.replace(/^\//, '') ?? '');
    if (Number(element.__bUseRequestToken ?? 0) !== requestToken) {
      continue;
    }
    const nextSignature = JSON.stringify({
      reference,
      props: props ?? {},
      fills: fillsSource,
      templateStamp: templatePayload.stamp ?? templatePayload.path ?? templatePayload.html
    });

    if (element.__bUseSignature === nextSignature) {
      continue;
    }

    const fragment = document.createElement('template');
    fragment.innerHTML = templatePayload.html;

    for (const fill of [...fillTemplate.content.querySelectorAll('[data-b-fill]')]) {
      const name = fill.getAttribute('data-b-fill');
      if (!name) {
        continue;
      }
      const target = fragment.content.querySelector(`[data-b-area="${escapeSelectorValue(name)}"]`);
      if (!target) {
        continue;
      }
      target.innerHTML = fill.tagName === 'TEMPLATE' ? fill.innerHTML : fill.innerHTML;
    }

    element.innerHTML = fragment.innerHTML;
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      element.__bScope = props;
      element.setAttribute('data-signals', safeJsonSignals(props));
    } else {
      element.__bScope = {};
      element.removeAttribute('data-signals');
    }
    element.__bUseSignature = nextSignature;
    changed = true;
  }
  return changed;
}

function renderFrameworkHtml(root, datastar) {
  let changed = false;
  const nodes = [...root.querySelectorAll('[data-b-html]')];
  for (const element of nodes) {
    const expression = element.getAttribute('data-b-html');
    if (!expression) {
      continue;
    }

    const value = evaluateFrameworkExpression(expression, buildFrameworkScope(element, datastar));
    const markup = frameworkConfig?.security?.html === 'trusted'
      ? String(value ?? '')
      : sanitizeFrameworkHtml(value);
    if (element.__bHtmlValue === markup) {
      continue;
    }
    element.innerHTML = markup;
    element.__bHtmlValue = markup;
    changed = true;
  }
  return changed;
}

async function applyFrameworkDirectives(root = rootElement()) {
  if (!root || frameworkDirectiveRunning) {
    return false;
  }

  frameworkDirectiveRunning = true;
  try {
    const datastar = await loadDatastar();
    let changed = false;
    let pending = false;
    for (let pass = 0; pass < FRAMEWORK_DIRECTIVE_MAX_PASSES; pass += 1) {
      let passChanged = false;
      passChanged = applyFillTargets(root) || passChanged;
      passChanged = await renderFrameworkUse(root, datastar) || passChanged;
      passChanged = renderFrameworkEach(root, datastar) || passChanged;
      passChanged = renderFrameworkIf(root, datastar) || passChanged;
      passChanged = renderFrameworkHtml(root, datastar) || passChanged;
      changed = changed || passChanged;
      if (!passChanged) {
        break;
      }
      if (pass === FRAMEWORK_DIRECTIVE_MAX_PASSES - 1) {
        pending = true;
      }
    }
    if (pending) {
      scheduleFrameworkDirectives();
    }
    return changed;
  } finally {
    frameworkDirectiveRunning = false;
  }
}

function scheduleFrameworkDirectives() {
  if (frameworkDirectiveScheduled) {
    return;
  }

  frameworkDirectiveScheduled = true;
  const run = async () => {
    frameworkDirectiveScheduled = false;
    await applyFrameworkDirectives(rootElement());
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      void run();
    });
    return;
  }

  window.setTimeout(() => {
    void run();
  }, 0);
}

function observeFrameworkDom() {
  frameworkDirectiveObserver?.disconnect?.();
  const root = rootElement();
  if (!root || typeof MutationObserver !== 'function') {
    return;
  }

  frameworkDirectiveObserver = new MutationObserver(() => {
    if (!frameworkDirectiveRunning) {
      scheduleFrameworkDirectives();
    }
  });

  frameworkDirectiveObserver.observe(root, {
    attributes: true,
    attributeFilter: [
      'data-b-if',
      'data-b-each',
      'data-b-use',
      'data-b-props',
      'data-b-area',
      'data-b-fill',
      'data-b-html',
      'data-b-loading',
      'data-b-error',
      'data-signals',
      'data-computed'
    ],
    childList: true,
    subtree: true
  });
}

function observeFrameworkSignals() {
  for (const eventName of ['input', 'change', 'click', 'submit', 'keyup']) {
    document.addEventListener(eventName, () => {
      scheduleFrameworkDirectives();
    }, true);
  }
}

function routeMatcher(routePath) {
  const keys = [];
  const pattern = normalizePath(routePath)
    .split('/')
    .map((segment) => {
      if (!segment) {
        return '';
      }
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      if (segment === '*') {
        keys.push('wildcard');
        return '(.*)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  return {
    keys,
    regex: new RegExp(`^${pattern || '/'}$`)
  };
}

async function loadDatastar() {
  if (!datastarModulePromise) {
    datastarModulePromise = import('/framework/datastar.js').then((module) => {
      datastarRuntime = module;
      return module;
    });
  }
  return datastarModulePromise;
}

async function loadAppContract() {
  if (!appContractPromise) {
    appContractPromise = fetch('/.well-known/brackets-app.json', {
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load Brackets app contract: ${response.status}`);
      }
      return response.json();
    }).then((contract) => {
      resolvedAppContract = contract;
      scheduleRoutePreloads(contract);
      return contract;
    });
  }
  return appContractPromise;
}

function routeTable(contract) {
  if (contract && routeTableCache.has(contract)) {
    return routeTableCache.get(contract);
  }

  const table = (contract?.routes ?? []).map((route) => {
    const primary = routeMatcher(route.route);
    const aliases = (route.aliases ?? []).map((alias) => ({
      path: alias,
      ...routeMatcher(alias)
    }));
    return {
      ...route,
      matcher: primary,
      aliases: aliases
    };
  });

  if (contract && typeof contract === 'object') {
    routeTableCache.set(contract, table);
  }
  return table;
}

function matchRoute(contract, pathname) {
  const normalized = normalizePath(pathname);
  for (const route of routeTable(contract)) {
    const primaryMatch = normalized.match(route.matcher.regex);
    if (primaryMatch) {
      return {
        route,
        params: route.matcher.keys.reduce((accumulator, key, index) => {
          accumulator[key] = primaryMatch[index + 1];
          return accumulator;
        }, {})
      };
    }

    for (const alias of route.aliases) {
      const aliasMatch = normalized.match(alias.regex);
      if (aliasMatch) {
        return {
          route,
          params: alias.keys.reduce((accumulator, key, index) => {
            accumulator[key] = aliasMatch[index + 1];
            return accumulator;
          }, {})
        };
      }
    }
  }
  return null;
}

function buildHref(target, contract) {
  if (typeof target === 'string') {
    return normalizePath(target);
  }

  const route = routeTable(contract).find((item) => item.id === target?.id);
  if (!route) {
    return '/';
  }

  let href = route.route.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    return encodeURIComponent(String(target?.params?.[key] ?? ''));
  });

  if (target?.query && typeof target.query === 'object') {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(target.query)) {
      if (value !== undefined && value !== null) {
        search.set(key, String(value));
      }
    }
    const queryString = search.toString();
    if (queryString) {
      href += `?${queryString}`;
    }
  }

  if (target?.hash) {
    href += `#${String(target.hash).replace(/^#/, '')}`;
  }

  return normalizePath(href);
}

function cleanupActiveLogic() {
  for (const cleanup of activeCleanups.splice(0)) {
    try {
      cleanup();
    } catch {
      // no-op
    }
  }
  activeLogic = null;
  activeRoute = null;
}

function setSignalsValue(datastar, nextValue) {
  if (typeof nextValue === 'string') {
    return nextValue;
  }
  return nextValue;
}

function cloneRuntimeValue(value) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to the JSON-safe clone path below.
    }
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

function runtimeValuesEqual(left, right) {
  if (left === right) {
    return true;
  }

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function nextCacheToken() {
  cacheSequence += 1;
  return cacheSequence;
}

function flattenOptimisticPatch(patch, prefix = '', entries = []) {
  if (patch === undefined) {
    return entries;
  }

  if (prefix && (patch === null || typeof patch !== 'object' || Array.isArray(patch))) {
    entries.push([prefix, cloneRuntimeValue(patch)]);
    return entries;
  }

  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    if (prefix) {
      entries.push([prefix, cloneRuntimeValue(patch)]);
    }
    return entries;
  }

  for (const [key, value] of Object.entries(patch)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenOptimisticPatch(value, nextPath, entries);
      continue;
    }
    entries.push([nextPath, cloneRuntimeValue(value)]);
  }

  return entries;
}

function applySignalEntries(datastar, entries = []) {
  if (!entries.length) {
    return false;
  }
  datastar.mergePaths(entries.map(([path, value]) => [path, setSignalsValue(datastar, value)]));
  scheduleFrameworkDirectives();
  return true;
}

function requestKey(target, options = {}, fallback = 'request') {
  const explicit = String(options.key ?? '').trim();
  if (explicit) {
    return explicit;
  }

  if (typeof target === 'string' && target.trim()) {
    const url = new URL(target, window.location.origin);
    const pathname = normalizePath(url.pathname);
    return pathname === '/' ? fallback : pathname;
  }

  return fallback;
}

function getRequestEntry(key) {
  return requestStateCache.get(String(key)) ?? {
    loading: false,
    error: null,
    token: 0,
    updatedAt: 0
  };
}

function setRequestEntry(key, patch = {}) {
  const cacheKey = String(key);
  const next = {
    ...getRequestEntry(cacheKey),
    ...patch,
    updatedAt: Date.now()
  };
  requestStateCache.set(cacheKey, next);
  return next;
}

function clearRequestError(key) {
  return setRequestEntry(key, { error: null });
}

function nextRequestToken() {
  requestSequence += 1;
  return requestSequence;
}

function currentRequestToken(key) {
  return Number(getRequestEntry(key).token ?? 0);
}

function beginRequestEntry(key, patch = {}) {
  const token = nextRequestToken();
  setRequestEntry(key, {
    loading: true,
    error: null,
    token,
    ...patch
  });
  return token;
}

function isCurrentRequest(key, token) {
  return currentRequestToken(key) === Number(token);
}

function settleRequestEntry(key, token, patch = {}) {
  if (!isCurrentRequest(key, token)) {
    return getRequestEntry(key);
  }
  return setRequestEntry(key, {
    ...patch,
    token
  });
}

function failRequestEntry(key, token, error) {
  return settleRequestEntry(key, token, {
    loading: false,
    error: String(error?.message ?? error)
  });
}

function requestStateApi() {
  return {
    loading(key) {
      return getRequestEntry(key).loading === true;
    },
    hasError(key) {
      return Boolean(getRequestEntry(key).error);
    },
    error(key) {
      return getRequestEntry(key).error ?? null;
    },
    message(key) {
      return getRequestEntry(key).error ?? '';
    },
    state(key) {
      return { ...getRequestEntry(key) };
    },
    clear(key) {
      if (key === undefined || key === null) {
        for (const stream of liveReadStreams.values()) {
          stream.close();
        }
        liveReadStreams.clear();
        requestStateCache.clear();
        return true;
      }
      const existing = liveReadStreams.get(String(key));
      if (existing) {
        existing.close();
        liveReadStreams.delete(String(key));
      }
      requestStateCache.delete(String(key));
      return true;
    }
  };
}

async function fetchSession(force = false) {
  const fresh = !force
    && sessionState
    && typeof sessionState === 'object'
    && (Date.now() - sessionFetchedAt) <= SESSION_CACHE_TTL_MS;
  if (fresh) {
    return sessionState;
  }

  if (sessionRequestPromise) {
    return sessionRequestPromise;
  }

  const stateKey = 'session';
  const token = beginRequestEntry(stateKey);

  sessionRequestPromise = fetch('/__brackets/session', {
    headers: {
      Accept: 'application/json'
    },
    cache: 'no-store',
    credentials: 'same-origin'
  }).catch((error) => {
    failRequestEntry(stateKey, token, error);
    throw error;
  }).then(async (response) => {
    if (!response.ok) {
      const error = new Error(`Session request failed with ${response.status}`);
      if (response.status === 401 || response.status === 403) {
        sessionState = { authenticated: false, user: null };
        sessionFetchedAt = Date.now();
        settleRequestEntry(stateKey, token, {
          loading: false,
          error: null
        });
        scheduleFrameworkDirectives();
        return sessionState;
      }
      failRequestEntry(stateKey, token, error);
      throw error;
    }

    const nextState = await response.json();
    if (!isCurrentRequest(stateKey, token)) {
      return sessionState;
    }

    sessionState = nextState;
    sessionFetchedAt = Date.now();
    if (typeof nextState?.csrfToken === 'string' && nextState.csrfToken.trim()) {
      setMetaContent('brackets-csrf', nextState.csrfToken.trim());
    }
    settleRequestEntry(stateKey, token, {
      loading: false,
      error: null
    });
    scheduleFrameworkDirectives();
    return sessionState;
  }).finally(() => {
    sessionRequestPromise = null;
  });

  return sessionRequestPromise;
}

function createAuthApi() {
  return {
    get authenticated() {
      return sessionState?.authenticated === true;
    },
    session() {
      return fetchSession(false);
    },
    refresh() {
      return fetchSession(true);
    }
  };
}

function triggerDownload(target, filename) {
  const href = new URL(String(target ?? '/'), window.location.origin).href;
  const anchor = document.createElement('a');
  anchor.href = href;
  if (filename) {
    anchor.download = String(filename);
  }
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  return href;
}

function createStateApi(datastar, cacheApi = null) {
  return {
    get(path) {
      if (!path) {
        return datastar.root;
      }
      return datastar.getPath(path);
    },
    set(nextValue, value) {
      if (typeof nextValue === 'string') {
        datastar.mergePaths([[nextValue, setSignalsValue(datastar, value)]]);
        scheduleFrameworkDirectives();
        return value;
      }
      datastar.mergePatch(nextValue ?? {});
      scheduleFrameworkDirectives();
      return nextValue;
    },
    invalidate(key) {
      if (cacheApi && typeof cacheApi.invalidate === 'function') {
        return cacheApi.invalidate(key);
      }
      return false;
    },
    async optimistic(patch, task) {
      const resolvedPatch = typeof patch === 'function' ? patch(datastar.root) : patch;
      const updates = flattenOptimisticPatch(resolvedPatch);
      const rollback = updates.map(([path, value]) => [
        path,
        {
          previous: cloneRuntimeValue(datastar.getPath(path)),
          applied: cloneRuntimeValue(value)
        }
      ]);
      applySignalEntries(datastar, updates);

      try {
        return await Promise.resolve(typeof task === 'function' ? task() : task);
      } catch (error) {
        const safeRollback = rollback
          .filter(([path, entry]) => runtimeValuesEqual(datastar.getPath(path), entry.applied))
          .map(([path, entry]) => [path, entry.previous]);
        applySignalEntries(datastar, safeRollback);
        throw error;
      }
    }
  };
}

function getCacheEntry(key) {
  return frameworkCache.get(String(key));
}

function setCacheEntry(key, entry) {
  frameworkCache.set(String(key), entry);
  return entry;
}

function cacheGeneration(store, key) {
  return Number(store.get(String(key)) ?? 0);
}

function bumpCacheGeneration(store, key) {
  const cacheKey = String(key);
  const next = cacheGeneration(store, cacheKey) + 1;
  store.set(cacheKey, next);
  return next;
}

function createCacheApi() {
  return {
    async fetch(key, loader, options = {}) {
      const cacheKey = String(key);
      const generation = cacheGeneration(frameworkCacheGenerations, cacheKey);
      const entry = getCacheEntry(cacheKey);
      const ttlMs = Number(options.ttlMs ?? 0);
      const fresh = entry
        && entry.generation === generation
        && (!ttlMs || (Date.now() - entry.at) <= ttlMs);

      if (fresh && 'value' in entry) {
        return entry.value;
      }

      if (entry?.generation === generation && 'value' in entry && options.staleWhileRevalidate === true) {
        const refreshToken = nextCacheToken();
        const refreshPromise = Promise.resolve(typeof loader === 'function' ? loader() : loader)
          .then((value) => {
            const current = getCacheEntry(cacheKey);
            if (cacheGeneration(frameworkCacheGenerations, cacheKey) !== generation || current?.requestToken !== refreshToken) {
              return value;
            }
            setCacheEntry(cacheKey, {
              value,
              at: Date.now(),
              generation
            });
            return value;
          })
          .catch(() => entry.value)
          .finally(() => {
            const current = getCacheEntry(cacheKey);
            if (current?.promise === refreshPromise && current?.requestToken === refreshToken) {
              setCacheEntry(cacheKey, {
                value: current.value,
                at: current.at,
                generation: current.generation
              });
            }
          });

        setCacheEntry(cacheKey, {
          ...(entry ?? {}),
          promise: refreshPromise,
          generation,
          requestToken: refreshToken
        });
        return entry.value;
      }

      if (entry?.generation === generation && entry?.promise) {
        return entry.promise;
      }

      const requestToken = nextCacheToken();
      const promise = Promise.resolve(typeof loader === 'function' ? loader() : loader)
        .then((value) => {
          const current = getCacheEntry(cacheKey);
          if (cacheGeneration(frameworkCacheGenerations, cacheKey) !== generation || current?.requestToken !== requestToken) {
            return value;
          }
          setCacheEntry(cacheKey, {
            value,
            at: Date.now(),
            generation
          });
          return value;
        })
        .catch((error) => {
          const current = getCacheEntry(cacheKey);
          if (cacheGeneration(frameworkCacheGenerations, cacheKey) !== generation || current?.requestToken !== requestToken) {
            throw error;
          }
          const previous = getCacheEntry(cacheKey);
          if (previous?.value !== undefined) {
            setCacheEntry(cacheKey, previous);
          } else {
            frameworkCache.delete(cacheKey);
          }
          throw error;
        });

      setCacheEntry(cacheKey, {
        ...(entry ?? {}),
        promise,
        at: entry?.at ?? 0,
        value: entry?.value,
        generation,
        requestToken
      });
      return promise;
    },
    async refresh(key, loader) {
      const cacheKey = String(key);
      const previous = getCacheEntry(cacheKey);
      const generation = cacheGeneration(frameworkCacheGenerations, cacheKey);
      const requestToken = nextCacheToken();
      const promise = Promise.resolve(typeof loader === 'function' ? loader() : loader)
        .then((value) => {
          const current = getCacheEntry(cacheKey);
          if (cacheGeneration(frameworkCacheGenerations, cacheKey) !== generation || current?.requestToken !== requestToken) {
            return value;
          }
          setCacheEntry(cacheKey, {
            value,
            at: Date.now(),
            generation
          });
          return value;
        })
        .catch((error) => {
          const current = getCacheEntry(cacheKey);
          if (cacheGeneration(frameworkCacheGenerations, cacheKey) !== generation || current?.requestToken !== requestToken) {
            throw error;
          }
          if (previous) {
            setCacheEntry(cacheKey, previous);
          } else {
            frameworkCache.delete(cacheKey);
          }
          throw error;
        });

      setCacheEntry(cacheKey, {
        ...(previous ?? {}),
        promise,
        at: previous?.at ?? 0,
        value: previous?.value,
        generation,
        requestToken
      });
      return promise;
    },
    invalidate(key) {
      if (key === undefined || key === null) {
        for (const cacheKey of frameworkCache.keys()) {
          bumpCacheGeneration(frameworkCacheGenerations, cacheKey);
        }
        for (const cacheKey of routeRenderCache.keys()) {
          bumpCacheGeneration(routeCacheGenerations, cacheKey);
        }
        frameworkCache.clear();
        routeRenderCache.clear();
        return true;
      }

      const prefix = String(key);
      bumpCacheGeneration(frameworkCacheGenerations, prefix);
      bumpCacheGeneration(routeCacheGenerations, prefix);
      frameworkCache.delete(prefix);
      routeRenderCache.delete(prefix);
      for (const cacheKey of [...frameworkCache.keys()]) {
        if (cacheKey.startsWith(prefix)) {
          bumpCacheGeneration(frameworkCacheGenerations, cacheKey);
          frameworkCache.delete(cacheKey);
        }
      }
      for (const cacheKey of [...routeRenderCache.keys()]) {
        if (cacheKey.startsWith(prefix)) {
          bumpCacheGeneration(routeCacheGenerations, cacheKey);
          routeRenderCache.delete(cacheKey);
        }
      }
      return true;
    }
  };
}

function invalidateRuntimeCacheKeys(keys = []) {
  const cache = createCacheApi();
  for (const key of keys) {
    if (key === undefined || key === null || key === '') {
      continue;
    }
    cache.invalidate(String(key));
  }
}

function invalidationRoutes(payload) {
  return Array.isArray(payload?.invalidate?.routes)
    ? payload.invalidate.routes.map((route) => normalizePath(route)).filter(Boolean)
    : [];
}

function invalidationCacheKeys(payload) {
  return Array.isArray(payload?.invalidate?.cacheKeys)
    ? payload.invalidate.cacheKeys.map((key) => String(key ?? '').trim()).filter(Boolean)
    : [];
}

function schedulePreloadTargets(renderTargets = [], idleTargets = [], options = {}) {
  for (const target of renderTargets) {
    void fetchRoutePayload(target, options).catch(() => null);
  }

  const runIdlePreloads = () => {
    for (const target of idleTargets) {
      void fetchRoutePayload(target, options).catch(() => null);
    }
  };

  if (!idleTargets.length) {
    return;
  }

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => {
      runIdlePreloads();
    });
    return;
  }

  window.setTimeout(runIdlePreloads, 150);
}

async function warmInvalidatedPreloads(contract, currentPath, affectedRoutes) {
  if (!contract || !affectedRoutes.size) {
    return;
  }

  const renderTargets = [];
  const idleTargets = [];
  for (const route of routeTable(contract)) {
    const target = normalizePath(route.route ?? '/');
    if (!affectedRoutes.has(target) || target === currentPath || route.redirectTo) {
      continue;
    }

    const preload = String(route.preload ?? '').trim().toLowerCase();
    if (preload === 'render') {
      renderTargets.push(target);
    } else if (preload === 'idle') {
      idleTargets.push(target);
    }
  }

  schedulePreloadTargets(renderTargets, idleTargets, {
    force: true,
    staleWhileRevalidate: true
  });
}

async function applyRuntimeInvalidation(payload) {
  if (payload?.invalidate?.write === false) {
    return;
  }
  const routeKeys = invalidationRoutes(payload);
  const cacheKeys = invalidationCacheKeys(payload);
  if (!routeKeys.length && !cacheKeys.length) {
    return;
  }

  invalidateRuntimeCacheKeys([...cacheKeys, ...routeKeys]);

  const affectedRoutes = new Set(routeKeys);
  const currentPath = normalizePath(window.location.pathname);
  const contract = resolvedAppContract ?? await loadAppContract().catch(() => null);
  await warmInvalidatedPreloads(contract, currentPath, affectedRoutes);

  if (currentShell === 'app' && affectedRoutes.has(currentPath)) {
    await renderRoute(currentPath, {
      replace: true,
      force: true,
      navigationToken: navigationSequence
    }).catch(() => null);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeOptions(value) {
  if (!isPlainObject(value)) {
    return false;
  }

  return [
    'headers',
    'query',
    'as',
    'result',
    'target',
    'selector',
    'contentType',
    'body',
    'cache',
    'withCredentials',
    'onMessage',
    'onOpen',
    'onError',
    'path',
    'closeOnError'
  ].some((key) => key in value);
}

function resultModeFor(target, options = {}) {
  const explicit = String(options.as ?? options.result ?? '').trim().replace(/^\./, '').toLowerCase();
  if (explicit) {
    return explicit;
  }

  const pathname = new URL(String(target ?? '/'), window.location.origin).pathname.toLowerCase();
  if (pathname.endsWith('.state')) {
    return 'state';
  }
  if (pathname.endsWith('.json')) {
    return 'json';
  }
  if (pathname.endsWith('.html')) {
    return 'html';
  }
  if (pathname.endsWith('.sse')) {
    return 'sse';
  }

  return '';
}

function requestOptions(method, payloadOrOptions, maybeOptions) {
  if (method === 'GET' || method === 'HEAD') {
    return {
      payload: null,
      options: isPlainObject(payloadOrOptions) ? payloadOrOptions : (maybeOptions ?? {})
    };
  }

  if (maybeOptions === undefined && looksLikeOptions(payloadOrOptions)) {
    return {
      payload: payloadOrOptions.body ?? null,
      options: payloadOrOptions
    };
  }

  return {
    payload: payloadOrOptions,
    options: maybeOptions ?? {}
  };
}

function resolveResponseTarget(target) {
  if (!target) {
    return null;
  }
  if (typeof target === 'string') {
    return document.querySelector(target);
  }
  return target;
}

function parseEventPayload(data) {
  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function applyResponseMode(datastar, mode, value, options = {}) {
  if (mode === 'state') {
    const state = createStateApi(datastar);
    if (typeof options.path === 'string' && options.path.trim()) {
      state.set(options.path.trim(), value);
      scheduleFrameworkDirectives();
      return value;
    }
    if (isPlainObject(value)) {
      state.set(value);
    }
    scheduleFrameworkDirectives();
    return value;
  }

  if (mode === 'html') {
    const target = resolveResponseTarget(options.target ?? options.selector);
    if (target) {
      const markup = frameworkConfig?.security?.html === 'trusted'
        ? String(value ?? '')
        : sanitizeFrameworkHtml(value);
      target.innerHTML = markup;
      scheduleFrameworkDirectives();
    }
    return value;
  }

  return value;
}

async function parseResponseBody(response, mode) {
  if (mode === 'html') {
    return response.text();
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (mode === 'json' || mode === 'state' || contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

async function parseFrameworkErrorResponse(response) {
  const contentType = response.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return {
          message: String(payload.error ?? `Request failed with ${response.status}`),
          code: String(payload.code ?? ''),
          requestId: String(payload.requestId ?? '')
        };
      }
    }
    const text = await response.text();
    return {
      message: text || `Request failed with ${response.status}`,
      code: '',
      requestId: ''
    };
  } catch {
    return {
      message: `Request failed with ${response.status}`,
      code: '',
      requestId: ''
    };
  }
}

function appendQuery(url, query) {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        url.searchParams.append(key, String(entry));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

function toFormData(value) {
  if (value instanceof FormData) {
    return value;
  }
  if (value instanceof HTMLFormElement) {
    return new FormData(value);
  }

  const formData = new FormData();
  for (const [key, entry] of Object.entries(value ?? {})) {
    if (entry === undefined || entry === null) {
      continue;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) {
        formData.append(key, item instanceof Blob ? item : String(item));
      }
      continue;
    }
    formData.append(key, entry instanceof Blob ? entry : String(entry));
  }
  return formData;
}

function buildRequestInit(method, payload, options = {}) {
  const headers = new Headers(options.headers ?? {});
  const init = {
    method,
    headers,
    cache: options.cache ?? 'no-store',
    credentials: options.credentials ?? 'same-origin'
  };

  if (method === 'GET' || method === 'HEAD') {
    return init;
  }

  const csrfToken = readMetaContent('brackets-csrf');
  if (csrfToken && !headers.has('x-brackets-csrf')) {
    headers.set('x-brackets-csrf', csrfToken);
  }

  const body = options.body !== undefined ? options.body : payload;
  if (body === undefined || body === null) {
    return init;
  }

  if (options.contentType === 'form') {
    init.body = toFormData(body);
    return init;
  }

  if (body instanceof FormData || typeof body === 'string' || body instanceof Blob || body instanceof URLSearchParams) {
    init.body = body;
    return init;
  }

  headers.set('Content-Type', 'application/json');
  init.body = JSON.stringify(body);
  return init;
}

async function openLiveRead(datastar, target, options = {}) {
  if (typeof EventSource !== 'function') {
    throw new Error('Live read() requires EventSource support in the current host.');
  }

  const href = new URL(String(target ?? '/'), window.location.origin).href;
  const stateKey = requestKey(href, options, 'live');
  const mode = resultModeFor(href, { ...options, result: options.result ?? options.as ?? 'state' });
  const token = beginRequestEntry(stateKey);
  const existing = liveReadStreams.get(stateKey);
  if (existing) {
    existing.close();
  }

  return new Promise((resolve, reject) => {
    const source = new EventSource(href, {
      withCredentials: options.withCredentials === true
    });
    let opened = false;

    const stream = {
      href,
      close() {
        if (liveReadStreams.get(stateKey)?.token === token) {
          liveReadStreams.delete(stateKey);
        }
        source.close();
      }
    };
    liveReadStreams.set(stateKey, {
      token,
      close: stream.close
    });

    source.addEventListener('open', () => {
      if (!isCurrentRequest(stateKey, token)) {
        stream.close();
        return;
      }
      opened = true;
      settleRequestEntry(stateKey, token, {
        loading: false,
        error: null
      });
      if (typeof options.onOpen === 'function') {
        options.onOpen(stream);
      }
      resolve(stream);
    });

    source.addEventListener('message', (event) => {
      if (!isCurrentRequest(stateKey, token)) {
        stream.close();
        return;
      }
      const payload = applyResponseMode(datastar, mode, parseEventPayload(event.data), options);
      scheduleFrameworkDirectives();
      if (typeof options.onMessage === 'function') {
        options.onMessage(payload, event, stream);
      }
    });

    source.addEventListener('error', (event) => {
      let message = `Live read() failed for ${href}.`;
      let code = '';
      let requestId = '';
      const eventData = parseEventPayload(event?.data);
      if (eventData && typeof eventData === 'object' && !Array.isArray(eventData)) {
        message = String(eventData.error ?? message);
        code = String(eventData.code ?? '');
        requestId = String(eventData.requestId ?? '');
      }
      const error = new Error(message);
      if (code) {
        error.code = code;
      }
      if (requestId) {
        error.requestId = requestId;
      }
      failRequestEntry(stateKey, token, error);
      if (typeof options.onError === 'function') {
        options.onError(error, event, stream);
      }
      if (!opened) {
        source.close();
        reject(error);
        return;
      }
      if (options.closeOnError !== false) {
        source.close();
      }
    });
  });
}

async function transportRequest(datastar, method, target, payloadOrOptions, maybeOptions) {
  const { payload, options } = requestOptions(method, payloadOrOptions, maybeOptions);
  const url = new URL(String(target ?? '/'), window.location.origin);
  appendQuery(url, options.query);
  const stateKey = requestKey(url.href, options);

  const mode = resultModeFor(url.href, options);
  if (mode === 'sse') {
    return openLiveRead(datastar, url.href, options);
  }

  const token = beginRequestEntry(stateKey);

  const response = await fetch(url.href, buildRequestInit(method, payload, options)).catch((error) => {
    failRequestEntry(stateKey, token, error);
    throw error;
  });
  if (!response.ok) {
    const failure = await parseFrameworkErrorResponse(response);
    const error = new Error(failure.requestId
      ? `${failure.message} [${failure.requestId}]`
      : failure.message);
    if (failure.code) {
      error.code = failure.code;
    }
    if (failure.requestId) {
      error.requestId = failure.requestId;
    }
    failRequestEntry(stateKey, token, error);
    throw error;
  }

  const value = await parseResponseBody(response, mode);
  settleRequestEntry(stateKey, token, {
    loading: false,
    error: null
  });
  return applyResponseMode(datastar, mode, value, options);
}

async function runtimeTransport(name, payloadOrOptions, maybeOptions, method) {
  const datastar = await loadDatastar();
  return transportRequest(datastar, method, name, payloadOrOptions, maybeOptions);
}

function resolveActionElement(evt, el) {
  return el ?? evt?.target ?? null;
}

function isSubmitControl(element) {
  if (!element) {
    return false;
  }
  const tagName = typeof element.tagName === 'string'
    ? element.tagName.toLowerCase()
    : '';
  const type = typeof element.type === 'string'
    ? element.type.toLowerCase()
    : '';
  if (tagName === 'button') {
    return type === '' || type === 'submit';
  }
  return tagName === 'input' && (type === 'submit' || type === 'image');
}

function resolveActionFormContext(evt, el) {
  const element = resolveActionElement(evt, el);
  const submitter = evt?.submitter ?? (isSubmitControl(element) ? element : null);
  const directForm = element?.closest?.('form')
    ?? evt?.target?.closest?.('form')
    ?? submitter?.form
    ?? null;
  return {
    element,
    form: directForm,
    submitter
  };
}

function createActionFormData(form, submitter) {
  if (!form) {
    return null;
  }
  if (submitter) {
    try {
      return new FormData(form, submitter);
    } catch (_error) {
      // Older browsers may not support the submitter argument yet.
    }
  }
  return new FormData(form);
}

function formDataToActionValue(formData) {
  if (!formData) {
    return null;
  }
  const payload = {};
  for (const [key, value] of formData.entries()) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      if (Array.isArray(payload[key])) {
        payload[key].push(value);
      } else {
        payload[key] = [payload[key], value];
      }
      continue;
    }
    payload[key] = value;
  }
  return payload;
}

function currentActionValue(evt, el) {
  const { element, form, submitter } = resolveActionFormContext(evt, el);
  if (!element) {
    return form ? formDataToActionValue(createActionFormData(form, submitter)) : null;
  }
  if (element.files) {
    return form ? formDataToActionValue(createActionFormData(form, submitter)) : Array.from(element.files);
  }
  const isSubmitEvent = evt?.type === 'submit' || Boolean(evt?.submitter) || isSubmitControl(element);
  if (isSubmitEvent && form) {
    return formDataToActionValue(createActionFormData(form, submitter));
  }
  if ('value' in element) {
    return element.value;
  }
  return form ? formDataToActionValue(createActionFormData(form, submitter)) : null;
}

function currentFormData(evt, el) {
  const { form, submitter } = resolveActionFormContext(evt, el);
  return createActionFormData(form, submitter);
}

function filesForAction(evt, el, name) {
  const element = resolveActionElement(evt, el);
  if (element?.files?.length) {
    if (!name || element.name === name) {
      return Array.from(element.files);
    }
  }
  const formData = currentFormData(evt, el);
  if (!formData) {
    return [];
  }
  const files = [];
  for (const [key, value] of formData.entries()) {
    if ((name && key !== name) || !(value instanceof File)) {
      continue;
    }
    files.push(value);
  }
  return files;
}

function currentRouteState() {
  const url = new URL(window.location.href);
  return {
    path: normalizePath(url.pathname),
    query: Object.fromEntries(url.searchParams.entries()),
    hash: url.hash,
    id: activeRoute?.id ?? null,
    params: activeRoute?.params ?? {}
  };
}

async function rpc(kind, moduleName, methodName, args = []) {
  const csrfToken = readMetaContent('brackets-csrf');
  const response = await fetch('/__brackets/rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrfToken ? { 'x-brackets-csrf': csrfToken } : {})
    },
    cache: 'no-store',
    credentials: 'same-origin',
    body: JSON.stringify({
      kind,
      module: moduleName,
      method: methodName,
      args,
      route: currentRouteState()
    })
  });

  if (!response.ok) {
    const failure = await parseFrameworkErrorResponse(response);
    const error = new Error(failure.requestId
      ? `${failure.message} [${failure.requestId}]`
      : failure.message);
    if (failure.code) {
      error.code = failure.code;
    }
    if (failure.requestId) {
      error.requestId = failure.requestId;
    }
    throw error;
  }

  const payload = await response.json();
  await applyRuntimeInvalidation(payload);
  return payload.result;
}

function createModuleNamespace(kind, modules = []) {
  const namespace = {};
  for (const module of modules) {
    namespace[module.id] = new Proxy({}, {
      get(_target, property) {
        return (...args) => rpc(kind, module.id, String(property), args);
      }
    });
  }
  return namespace;
}

let navigate = async () => {};

function buildNavApi(contract) {
  return {
    to(target) {
      return navigate(buildHref(target, contract));
    },
    replace(target) {
      return navigate(buildHref(target, contract), { replace: true });
    },
    redirect(target) {
      return navigate(buildHref(target, contract), { replace: true });
    },
    href(target) {
      return buildHref(target, contract);
    },
    isActive(target) {
      return normalizePath(buildHref(target, contract)) === normalizePath(window.location.pathname);
    },
    match(target) {
      return this.isActive(target);
    },
    prefetch(target) {
      const href = buildHref(target, contract);
      return fetchRoutePayload(href, { force: true }).catch(() => null);
    },
    download(target, filename) {
      return triggerDownload(buildHref(target, contract), filename);
    },
    forward() {
      history.forward();
    }
  };
}

function runtimeNav() {
  return buildNavApi(resolvedAppContract ?? { routes: [] });
}

function routeSummary(contract, route, params, pathname) {
  if (!route) {
    return {
      id: null,
      path: normalizePath(pathname),
      params: {},
      aliases: [],
      href(target) {
        return buildHref(target ?? normalizePath(pathname), contract);
      }
    };
  }

  const currentParams = params ?? {};
  return {
    id: route.id,
    path: normalizePath(pathname ?? route.route),
    route: route.route,
    params: currentParams,
    aliases: [...(route.aliases ?? [])],
    href(target) {
      if (!target) {
        return buildHref({ id: route.id, params: currentParams }, contract);
      }
      return buildHref(target, contract);
    }
  };
}

function hookRoutes(contract) {
  return routeTable(contract).map((route) => ({
    id: route.id,
    route: route.route,
    aliases: [...(route.aliases ?? []).map((alias) => normalizePath(alias))],
    href(target) {
      return buildHref(target ?? { id: route.id }, contract);
    }
  }));
}

async function loadRouterHooks(contract) {
  if (routerHooksPromise) {
    return routerHooksPromise;
  }

  routerHooksPromise = (async () => {
    routerHooksState = {
      beforeEach: null,
      afterEach: null,
      notFound: null
    };

    const logicUrl = contract?.router?.logicUrl;
    if (!logicUrl) {
      return routerHooksState;
    }

    const module = await import(logicUrl.includes('?') ? `${logicUrl}&t=${Date.now()}` : `${logicUrl}?t=${Date.now()}`);
    const value = module.default ?? module;
    routerHooksState = {
      beforeEach: typeof value?.beforeEach === 'function' ? value.beforeEach : null,
      afterEach: typeof value?.afterEach === 'function' ? value.afterEach : null,
      notFound: typeof value?.notFound === 'function' ? value.notFound : null
    };
    return routerHooksState;
  })();

  return routerHooksPromise;
}

function normalizeHookTarget(result, contract) {
  if (!result) {
    return null;
  }
  if (typeof result === 'string') {
    return normalizePath(result);
  }
  if (typeof result === 'object') {
    if (typeof result.redirectTo === 'string') {
      return normalizePath(result.redirectTo);
    }
    return buildHref(result, contract);
  }
  return null;
}

async function callRouterHook(name, contract, targetMatch, currentPath) {
  const hooks = await loadRouterHooks(contract);
  const hook = hooks?.[name];
  if (typeof hook !== 'function') {
    return null;
  }

  const fromSummary = activeRoute
    ? routeSummary(contract, activeRoute, activeRoute.params, window.location.pathname)
    : null;
  const toSummary = routeSummary(contract, targetMatch?.route ?? null, targetMatch?.params ?? {}, currentPath);
  const nav = buildNavApi(contract);
  const context = {
    to: toSummary,
    from: fromSummary,
    routes: hookRoutes(contract),
    nav
  };

  const result = await hook(context);
  return normalizeHookTarget(result, contract);
}

function buildContext(contract, datastar, evt, el) {
  const url = new URL(window.location.href);
  const nav = buildNavApi(contract);
  const cache = createCacheApi();
  return {
    route: {
      id: activeRoute?.id ?? null,
      path: normalizePath(url.pathname),
      params: activeRoute?.params ?? {},
      query: Object.fromEntries(url.searchParams.entries()),
      hash: url.hash,
      href(target) {
        return buildHref(target ?? { id: activeRoute?.id, params: activeRoute?.params }, contract);
      },
      isActive(target) {
        return nav.isActive(target);
      }
    },
    state: createStateApi(datastar, cache),
    action: {
      event: evt ?? null,
      element: el ?? evt?.target ?? null,
      input() {
        return currentActionValue(evt, el);
      },
      formData() {
        return currentFormData(evt, el);
      },
      files(name) {
        return filesForAction(evt, el, name);
      }
    },
    data: dataNamespace,
    api: apiNamespace,
    cache,
    auth: createAuthApi(),
    nav,
    cleanup(fn) {
      if (typeof fn === 'function') {
        activeCleanups.push(fn);
      }
    }
  };
}

async function callLogic(name, args = [], evt = null, el = null) {
  if (!activeLogic || typeof activeLogic[name] !== 'function') {
    return null;
  }

  const datastar = await loadDatastar();
  const result = await activeLogic[name](buildContext(await loadAppContract(), datastar, evt, el), ...args);
  if (name === 'mount' && typeof result === 'function') {
    activeCleanups.push(result);
  }
  return result;
}

async function loadLogicModule(logicUrl) {
  if (!logicUrl) {
    return null;
  }
  const href = logicUrl.includes('?')
    ? `${logicUrl}&t=${Date.now()}`
    : `${logicUrl}?t=${Date.now()}`;
  const module = await import(href);
  return module.default ?? null;
}

function rootElement() {
  return document.getElementById('brackets-root');
}

function mountElement(root) {
  if (!root) {
    return null;
  }
  if (typeof root.matches === 'function' && root.matches('[data-b-mount]')) {
    return root;
  }
  return root.querySelector?.('[data-b-mount]') ?? null;
}

function parseHtmlTemplate(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html ?? '');
  return template;
}

function patchSharedLayoutAreas(root, payload) {
  if (!root || typeof payload?.html !== 'string') {
    return false;
  }

  const nextTemplate = parseHtmlTemplate(payload.html);
  const currentMount = mountElement(root);
  const nextMount = mountElement(nextTemplate.content);
  let changed = false;

  const currentAreas = [...root.querySelectorAll('[data-b-area]')];
  for (const currentArea of currentAreas) {
    if (currentArea === currentMount || currentMount?.contains?.(currentArea)) {
      continue;
    }

    const areaName = currentArea.getAttribute('data-b-area');
    if (!areaName) {
      continue;
    }

    const nextArea = nextTemplate.content.querySelector(`[data-b-area="${escapeSelectorValue(areaName)}"]`);
    if (!nextArea) {
      continue;
    }

    const nextMarkup = nextArea.innerHTML;
    if (currentArea.innerHTML !== nextMarkup) {
      currentArea.innerHTML = nextMarkup;
      changed = true;
    }
  }

  if (currentMount) {
    const nextMountMarkup = nextMount?.innerHTML ?? payload.mountHtml ?? '';
    if (currentMount.innerHTML !== nextMountMarkup) {
      currentMount.innerHTML = nextMountMarkup;
      changed = true;
    }
  }

  return changed;
}

function canPatchMountedArea(payload) {
  return Boolean(
    currentShell === 'app'
    && activeRoute?.layoutPath
    && payload?.route?.layoutPath
    && activeRoute.layoutPath === payload.route.layoutPath
    && typeof payload.mountHtml === 'string'
  );
}

function applyRouteMarkup(root, payload) {
  if (!canPatchMountedArea(payload)) {
    root.innerHTML = payload.html;
    return false;
  }

  const mountedArea = mountElement(root);
  if (!mountedArea) {
    root.innerHTML = payload.html;
    return false;
  }

  patchSharedLayoutAreas(root, payload);
  return true;
}

function restoreStarterShell() {
  const root = rootElement();
  if (!root) {
    return;
  }

  cleanupActiveLogic();
  root.innerHTML = starterMarkup;
  currentShell = 'starter';
  document.title = starterTitle;
  observeFrameworkDom();
  void refreshHealth(frameworkConfig);
}

async function renderRoute(pathname, options = {}) {
  const navigationToken = Number(options.navigationToken ?? navigationSequence);
  const contract = await loadAppContract();
  const match = matchRoute(contract, pathname);
  if (!match) {
    if (normalizePath(pathname) === '/') {
      restoreStarterShell();
      if (options.replace) {
        history.replaceState({ brackets: true, path: '/' }, '', '/');
      }
      return true;
    }
    return false;
  }

  const root = rootElement();
  if (!root) {
    return false;
  }

  const datastar = await loadDatastar();
  const payload = await fetchRoutePayload(pathname, {
    force: options.force === true
  });
  if (navigationToken !== navigationSequence) {
    return false;
  }
  if (payload.authStatus === 'unauthorized' && options.sessionRetryAttempted !== true) {
    const nextSession = await fetchSession(true).catch(() => null);
    if (navigationToken !== navigationSequence) {
      return false;
    }
    if (nextSession?.authenticated === true) {
      return renderRoute(pathname, {
        ...options,
        force: true,
        sessionRetryAttempted: true
      });
    }
  }
  if (payload.redirectTo) {
    return handleNavigation(payload.redirectTo, {
      ...options,
      replace: true
    });
  }

  cleanupActiveLogic();
  applyRouteMarkup(root, payload);
  currentShell = 'app';
  activeRoute = {
    ...payload.route,
    params: payload.params ?? {}
  };
  document.title = payload.route?.title ?? starterTitle;
  observeFrameworkDom();
  await applyFrameworkDirectives(root);

  dataNamespace = createModuleNamespace('data', contract.modules?.data ?? []);
  apiNamespace = createModuleNamespace('api', contract.modules?.api ?? []);
  activeLogic = await loadLogicModule(payload.route?.logicUrl);
  await callLogic('mount');

  if (options.replace) {
    history.replaceState({ brackets: true, path: normalizePath(pathname) }, '', normalizePath(pathname));
  } else if (!options.popstate) {
    history.pushState({ brackets: true, path: normalizePath(pathname) }, '', normalizePath(pathname));
  }

  await callRouterHook('afterEach', contract, {
    route: activeRoute,
    params: activeRoute.params ?? {}
  }, pathname);

  return true;
}

async function fetchRoutePayload(pathname, options = {}) {
  const normalized = normalizePath(pathname);
  const stateKey = requestKey(normalized, { key: 'route' }, 'route');
  const generation = cacheGeneration(routeCacheGenerations, normalized);
  const ttlMs = Number(options.ttlMs ?? ROUTE_RENDER_CACHE_TTL_MS);
  if (!options.force) {
    const cached = routeRenderCache.get(normalized);
    const fresh = cached?.generation === generation
      && cached?.payload
      && (!ttlMs || (Date.now() - cached.at) <= ttlMs);
    if (fresh) {
      return cached.payload;
    }
    if (cached?.generation === generation && cached?.payload && options.staleWhileRevalidate === true) {
      const refreshToken = nextCacheToken();
      const refreshPromise = fetch(`/__brackets/render?path=${encodeURIComponent(normalized)}`, {
        headers: {
          Accept: 'application/json'
        },
        cache: 'no-store'
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok || payload.ok !== true) {
          throw new Error(payload.error ?? `Unable to render route ${normalized}`);
        }
        const current = routeRenderCache.get(normalized);
        if (cacheGeneration(routeCacheGenerations, normalized) === generation && current?.requestToken === refreshToken) {
          routeRenderCache.set(normalized, {
            payload,
            at: Date.now(),
            generation
          });
        }
        return payload;
      }).catch(() => cached.payload);

      routeRenderCache.set(normalized, {
        ...(cached ?? {}),
        promise: refreshPromise,
        generation,
        requestToken: refreshToken
      });
      return cached.payload;
    }
    if (cached?.generation === generation && cached?.promise) {
      const token = beginRequestEntry(stateKey);
      return cached.promise.then((payload) => {
        settleRequestEntry(stateKey, token, {
          loading: false,
          error: null
        });
        return payload;
      }).catch((error) => {
        failRequestEntry(stateKey, token, error);
        throw error;
      });
    }
  }

  const token = beginRequestEntry(stateKey);
  const requestToken = nextCacheToken();
  const promise = fetch(`/__brackets/render?path=${encodeURIComponent(normalized)}`, {
    headers: {
      Accept: 'application/json'
    },
    cache: 'no-store'
  }).then(async (response) => {
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.error ?? `Unable to render route ${normalized}`);
    }
    const current = routeRenderCache.get(normalized);
    if (cacheGeneration(routeCacheGenerations, normalized) === generation && current?.requestToken === requestToken) {
      routeRenderCache.set(normalized, {
        payload,
        at: Date.now(),
        generation
      });
    }
    settleRequestEntry(stateKey, token, {
      loading: false,
      error: null
    });
    return payload;
  }).catch((error) => {
    const current = routeRenderCache.get(normalized);
    if (cacheGeneration(routeCacheGenerations, normalized) === generation && current?.requestToken === requestToken) {
      routeRenderCache.delete(normalized);
    }
    failRequestEntry(stateKey, token, error);
    throw error;
  });

  routeRenderCache.set(normalized, {
    promise,
    at: Date.now(),
    generation,
    requestToken
  });
  return promise;
}

async function handleNavigation(pathname, options = {}) {
  const normalized = normalizePath(pathname);
  const navigationToken = Number(options.navigationToken ?? (navigationSequence + 1));
  const visited = options.visited instanceof Set
    ? new Set(options.visited)
    : new Set();
  const hops = Number(options.hops ?? 0);
  navigationSequence = navigationToken;
  if (visited.has(normalized) || hops > MAX_NAVIGATION_REDIRECTS) {
    setRequestEntry('route', {
      loading: false,
      error: `Navigation loop detected for ${normalized}.`
    });
    return false;
  }
  visited.add(normalized);
  const contract = await loadAppContract().catch(() => ({ routes: [], router: {} }));

  if (normalized === '/') {
    restoreStarterShell();
    if (options.replace) {
      history.replaceState({ brackets: true, path: '/' }, '', '/');
    } else if (!options.popstate) {
      history.pushState({ brackets: true, path: '/' }, '', '/');
    }
    return true;
  }

  const match = matchRoute(contract, normalized);
  if (match) {
    const redirectTarget = match.route?.redirectTo
      ? normalizePath(match.route.redirectTo)
      : await callRouterHook('beforeEach', contract, match, normalized);
    if (redirectTarget && redirectTarget !== normalized) {
      return handleNavigation(redirectTarget, {
        ...options,
        navigationToken,
        visited,
        hops: hops + 1,
        replace: true
      });
    }
    return renderRoute(normalized, {
      ...options,
      navigationToken
    });
  }

  const notFoundTarget = await callRouterHook('notFound', contract, null, normalized);
  if (notFoundTarget && notFoundTarget !== normalized) {
    return handleNavigation(notFoundTarget, {
      ...options,
      navigationToken,
      visited,
      hops: hops + 1,
      replace: true
    });
  }

  return renderRoute(normalized, {
    ...options,
    navigationToken
  });
}

navigate = async (pathname, options = {}) => {
  return handleNavigation(pathname, options);
};

async function applyEntryBehavior(config) {
  const contract = await loadAppContract().catch(() => null);
  const currentPath = normalizePath(window.location.pathname);
  const hasRoutes = Boolean(contract?.routes?.length);

  if (!hasRoutes) {
    return;
  }

  if (currentPath !== '/' && currentPath !== '/index.html') {
    await handleNavigation(currentPath, { replace: true });
    return;
  }

  const entry = config?.entry ?? {};
  if (entry.autoStart === true && typeof entry.route === 'string' && entry.route.trim() && entry.route.trim() !== '/') {
    await handleNavigation(entry.route.trim(), { replace: true });
  }
}

function interceptLinkClicks() {
  document.addEventListener('click', async (event) => {
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor) {
      return;
    }
    if (anchor.target && anchor.target !== '_self') {
      return;
    }
    if (anchor.hasAttribute('download') || anchor.dataset.brxExternal === 'true') {
      return;
    }

    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) {
      return;
    }

    const contract = await loadAppContract().catch(() => null);
    const isStarter = normalizePath(url.pathname) === '/';
    const isAppRoute = contract ? Boolean(matchRoute(contract, url.pathname)) : false;
    if (!isStarter && !isAppRoute) {
      return;
    }

    event.preventDefault();
    await handleNavigation(url.pathname, {});
  });

  window.addEventListener('popstate', () => {
    void handleNavigation(window.location.pathname, { popstate: true, replace: true });
  });
}

function scheduleRoutePreloads(contract) {
  if (!contract || routePreloadsStarted) {
    return;
  }
  routePreloadsStarted = true;

  const renderTargets = [];
  const idleTargets = [];
  for (const route of routeTable(contract)) {
    if (route.redirectTo) {
      continue;
    }
    const preload = String(route.preload ?? '').trim().toLowerCase();
    const target = route.route;
    if (!target || target === '/') {
      continue;
    }
    if (preload === 'render') {
      renderTargets.push(target);
    } else if (preload === 'idle') {
      idleTargets.push(target);
    }
  }

  schedulePreloadTargets(renderTargets, idleTargets, {
    staleWhileRevalidate: true
  });
}

function exposeRuntime(config, host) {
  const cache = createCacheApi();
  window.BracketsRuntime = {
    config,
    host,
    auth: createAuthApi(),
    requestState: requestStateApi(),
    scope(element = null, event = null) {
      const target = element instanceof Element ? element : rootElement();
      return buildFrameworkScope(target, datastarRuntime, event);
    },
    mutate(path, value) {
      return loadDatastar().then((datastar) => createStateApi(datastar, cache).set(path, value));
    },
    read(target, options = {}) {
      return loadDatastar().then((datastar) => openLiveRead(datastar, target, options));
    },
    request(target, options = {}) {
      return runtimeTransport(target, options, undefined, 'GET');
    },
    get(target, options = {}) {
      return runtimeTransport(target, options, undefined, 'GET');
    },
    create(target, payload = null, options = {}) {
      return runtimeTransport(target, payload, options, 'POST');
    },
    update(target, payload = null, options = {}) {
      return runtimeTransport(target, payload, options, 'PUT');
    },
    patch(target, payload = null, options = {}) {
      return runtimeTransport(target, payload, options, 'PATCH');
    },
    delete(target, payload = null, options = {}) {
      return runtimeTransport(target, payload, options, 'DELETE');
    },
    cache,
    nav: {
      to(target) {
        return runtimeNav().to(target);
      },
      replace(target) {
        return runtimeNav().replace(target);
      },
      redirect(target) {
        return runtimeNav().redirect(target);
      },
      href(target) {
        return runtimeNav().href(target);
      },
      isActive(target) {
        return runtimeNav().isActive(target);
      },
      match(target) {
        return runtimeNav().match(target);
      },
      prefetch(target) {
        return runtimeNav().prefetch(target);
      },
      download(target, filename) {
        return runtimeNav().download(target, filename);
      },
      forward() {
        return runtimeNav().forward();
      }
    },
    refreshHealth() {
      return refreshHealth(config);
    },
    async callAction(name, args = [], evt = null, el = null) {
      return callLogic(name, args, evt, el);
    },
    async navigate(target, options = {}) {
      const contract = await loadAppContract().catch(() => ({ routes: [] }));
      return handleNavigation(buildHref(target, contract), options);
    }
  };
}

async function bootstrap() {
  frameworkConfig = readJsonScript('brackets-config', {});
  embeddedHost = readJsonScript('brackets-host', {});
  sessionState = readJsonScript('brackets-session', { authenticated: false, user: null });
  const root = rootElement();
  starterMarkup = root?.innerHTML ?? '';
  starterTitle = document.title;

  exposeRuntime(frameworkConfig, embeddedHost);
  setText('[data-brx-local-origin]', embeddedHost?.addresses?.localOrigin ?? embeddedHost?.origin ?? window.location.origin);
  setText('[data-brx-network-origin]', buildNetworkLabel(embeddedHost));
  setText('[data-brx-health-runtime]', hostSummary(embeddedHost));
  setText('[data-brx-health-mode]', modeSummary(embeddedHost));

  interceptLinkClicks();
  observeFrameworkSignals();
  observeFrameworkDom();
  await applyEntryBehavior(frameworkConfig);

  if (currentShell === 'starter') {
    await refreshHealth(frameworkConfig);
  }

  window.setInterval(() => {
    if (currentShell === 'starter') {
      void refreshHealth(frameworkConfig);
    }
  }, 5000);
}

void bootstrap();
