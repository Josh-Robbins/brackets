const DATASTAR_BUNDLE_URL = '/framework/datastar.js';

const root = typeof document === 'undefined'
  ? null
  : document.querySelector('#brackets-root');

function clone(value) {
  if (value === undefined || value === null) {
    return value;
  }

  try {
    return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function deepMerge(target, patch) {
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] ??= {};
      deepMerge(target[key], value);
      continue;
    }

    target[key] = value;
  }

  return target;
}

function snapshotKey(value) {
  if (value === undefined) {
    return 'undefined';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const SAFE_MEMBER_BLOCKLIST = new Set(['__proto__', 'prototype', 'constructor']);
const FRAMEWORK_CONSTANTS = Object.freeze({
  true: true,
  false: false,
  null: null,
  undefined
});
const MAX_NAVIGATION_REDIRECTS = 12;

function safeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isTrustedServiceWorkerContext(locationLike = globalThis.location) {
  if (!locationLike) {
    return false;
  }

  if (locationLike.protocol === 'https:') {
    return true;
  }

  const hostname = locationLike.hostname ?? '';
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1';
}

export function canRegisterServiceWorker(host = {}, locationLike = globalThis.location, navigatorLike = globalThis.navigator) {
  const serviceWorker = host?.serviceWorker ?? {};
  return Boolean(
    serviceWorker.available
    && serviceWorker.endpoint
    && navigatorLike?.serviceWorker?.register
    && isTrustedServiceWorkerContext(locationLike)
  );
}

function tokenizeFrameworkExpression(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const three = source.slice(index, index + 3);
    if (three === '===' || three === '!==') {
      tokens.push({ type: 'operator', value: three });
      index += 3;
      continue;
    }

    const two = source.slice(index, index + 2);
    if (['?.', '??', '&&', '||', '<=', '>=', '==', '!='].includes(two)) {
      tokens.push({ type: 'operator', value: two });
      index += 2;
      continue;
    }

    if (char === '"' || char === '\'') {
      const quote = char;
      let value = '';
      index += 1;

      while (index < source.length) {
        const next = source[index];
        if (next === '\\') {
          value += next + (source[index + 1] ?? '');
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

      tokens.push({ type: 'literal', value: JSON.parse(`"${value.replace(/"/g, '\\"')}"`) });
      continue;
    }

    if (/[0-9]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[0-9._]/.test(source[end])) {
        end += 1;
      }
      tokens.push({ type: 'literal', value: Number(source.slice(index, end).replace(/_/g, '')) });
      index = end;
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_$]/.test(source[end])) {
        end += 1;
      }
      const value = source.slice(index, end);
      tokens.push({ type: 'identifier', value });
      index = end;
      continue;
    }

    if ('()[]{}.,:+-*/%!<>?:'.includes(char)) {
      tokens.push({ type: 'punctuation', value: char });
      index += 1;
      continue;
    }

    throw new Error(`Unsupported expression token "${char}"`);
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

class FrameworkExpressionParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.index + offset] ?? this.tokens[this.tokens.length - 1];
  }

  match(...values) {
    const token = this.peek();
    if (!token || !values.includes(token.value)) {
      return false;
    }
    this.index += 1;
    return true;
  }

  consume(value) {
    const token = this.peek();
    if (token?.value !== value) {
      throw new Error(`Expected "${value}" but found "${token?.value ?? 'end of expression'}"`);
    }
    this.index += 1;
    return token;
  }

  parse() {
    const expression = this.parseConditional();
    if (this.peek().type !== 'eof') {
      throw new Error(`Unexpected token "${this.peek().value}"`);
    }
    return expression;
  }

  parseConditional() {
    let left = this.parseNullish();
    if (this.match('?')) {
      const consequent = this.parseConditional();
      this.consume(':');
      const alternate = this.parseConditional();
      left = { type: 'conditional', test: left, consequent, alternate };
    }
    return left;
  }

  parseNullish() {
    let left = this.parseLogicalOr();
    while (this.match('??')) {
      left = { type: 'logical', operator: '??', left, right: this.parseLogicalOr() };
    }
    return left;
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.match('||')) {
      left = { type: 'logical', operator: '||', left, right: this.parseLogicalAnd() };
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseEquality();
    while (this.match('&&')) {
      left = { type: 'logical', operator: '&&', left, right: this.parseEquality() };
    }
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    while (this.match('==', '!=', '===', '!==')) {
      const operator = this.tokens[this.index - 1].value;
      left = { type: 'binary', operator, left, right: this.parseComparison() };
    }
    return left;
  }

  parseComparison() {
    let left = this.parseAdditive();
    while (this.match('<', '<=', '>', '>=')) {
      const operator = this.tokens[this.index - 1].value;
      left = { type: 'binary', operator, left, right: this.parseAdditive() };
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.match('+', '-')) {
      const operator = this.tokens[this.index - 1].value;
      left = { type: 'binary', operator, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.match('*', '/', '%')) {
      const operator = this.tokens[this.index - 1].value;
      left = { type: 'binary', operator, left, right: this.parseUnary() };
    }
    return left;
  }

  parseUnary() {
    if (this.match('!', '+', '-')) {
      const operator = this.tokens[this.index - 1].value;
      return { type: 'unary', operator, argument: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expression = this.parsePrimary();

    while (true) {
      if (this.match('.')) {
        const property = this.peek();
        if (!['identifier', 'literal'].includes(property.type)) {
          throw new Error('Expected property name after "."');
        }
        this.index += 1;
        expression = {
          type: 'member',
          object: expression,
          property: { type: 'literal', value: property.value },
          computed: false,
          optional: false
        };
        continue;
      }

      if (this.match('?.')) {
        const property = this.peek();
        if (!['identifier', 'literal'].includes(property.type)) {
          throw new Error('Expected property name after "?."');
        }
        this.index += 1;
        expression = {
          type: 'member',
          object: expression,
          property: { type: 'literal', value: property.value },
          computed: false,
          optional: true
        };
        continue;
      }

      if (this.match('[')) {
        const property = this.parseConditional();
        this.consume(']');
        expression = {
          type: 'member',
          object: expression,
          property,
          computed: true,
          optional: false
        };
        continue;
      }

      if (this.match('(')) {
        const args = [];
        if (!this.match(')')) {
          do {
            args.push(this.parseConditional());
          } while (this.match(','));
          this.consume(')');
        }
        expression = { type: 'call', callee: expression, args };
        continue;
      }

      break;
    }

    return expression;
  }

  parsePrimary() {
    const token = this.peek();

    if (token.type === 'literal') {
      this.index += 1;
      return { type: 'literal', value: token.value };
    }

    if (token.type === 'identifier') {
      this.index += 1;
      return { type: 'identifier', name: token.value };
    }

    if (this.match('(')) {
      const expression = this.parseConditional();
      this.consume(')');
      return expression;
    }

    if (this.match('[')) {
      const elements = [];
      if (!this.match(']')) {
        do {
          elements.push(this.parseConditional());
        } while (this.match(','));
        this.consume(']');
      }
      return { type: 'array', elements };
    }

    if (this.match('{')) {
      const properties = [];
      if (!this.match('}')) {
        do {
          const keyToken = this.peek();
          if (!['identifier', 'literal'].includes(keyToken.type)) {
            throw new Error('Expected object key');
          }
          this.index += 1;
          const key = keyToken.value;
          let value;
          if (this.match(':')) {
            value = this.parseConditional();
          } else {
            value = { type: 'identifier', name: String(key) };
          }
          properties.push({ key, value });
        } while (this.match(','));
        this.consume('}');
      }
      return { type: 'object', properties };
    }

    throw new Error(`Unexpected token "${token.value}"`);
  }
}

function parseFrameworkExpression(source) {
  const parser = new FrameworkExpressionParser(tokenizeFrameworkExpression(source));
  return parser.parse();
}

function evaluateFrameworkAst(node, scope) {
  switch (node.type) {
    case 'literal':
      return node.value;
    case 'identifier':
      return Object.prototype.hasOwnProperty.call(scope, node.name)
        ? scope[node.name]
        : FRAMEWORK_CONSTANTS[node.name];
    case 'array':
      return node.elements.map((element) => evaluateFrameworkAst(element, scope));
    case 'object':
      return Object.fromEntries(node.properties.map((property) => [property.key, evaluateFrameworkAst(property.value, scope)]));
    case 'unary': {
      const argument = evaluateFrameworkAst(node.argument, scope);
      if (node.operator === '!') {
        return !argument;
      }
      if (node.operator === '+') {
        return +argument;
      }
      if (node.operator === '-') {
        return -argument;
      }
      throw new Error(`Unsupported unary operator "${node.operator}"`);
    }
    case 'binary': {
      const left = evaluateFrameworkAst(node.left, scope);
      const right = evaluateFrameworkAst(node.right, scope);
      switch (node.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '%': return left % right;
        case '<': return left < right;
        case '<=': return left <= right;
        case '>': return left > right;
        case '>=': return left >= right;
        case '==': return left == right;
        case '!=': return left != right;
        case '===': return left === right;
        case '!==': return left !== right;
        default:
          throw new Error(`Unsupported binary operator "${node.operator}"`);
      }
    }
    case 'logical':
      if (node.operator === '&&') {
        return evaluateFrameworkAst(node.left, scope) && evaluateFrameworkAst(node.right, scope);
      }
      if (node.operator === '||') {
        return evaluateFrameworkAst(node.left, scope) || evaluateFrameworkAst(node.right, scope);
      }
      if (node.operator === '??') {
        const left = evaluateFrameworkAst(node.left, scope);
        return left ?? evaluateFrameworkAst(node.right, scope);
      }
      throw new Error(`Unsupported logical operator "${node.operator}"`);
    case 'conditional':
      return evaluateFrameworkAst(node.test, scope)
        ? evaluateFrameworkAst(node.consequent, scope)
        : evaluateFrameworkAst(node.alternate, scope);
    case 'member': {
      const object = evaluateFrameworkAst(node.object, scope);
      if (object === undefined || object === null) {
        if (node.optional) {
          return undefined;
        }
        throw new Error('Cannot read properties of nullish value');
      }
      const property = node.computed
        ? evaluateFrameworkAst(node.property, scope)
        : node.property.value;
      if (SAFE_MEMBER_BLOCKLIST.has(String(property))) {
        return undefined;
      }
      return object[property];
    }
    case 'call': {
      const calleeNode = node.callee;
      let fn;
      let thisArg = undefined;

      if (calleeNode.type === 'member') {
        thisArg = evaluateFrameworkAst(calleeNode.object, scope);
        if (thisArg === undefined || thisArg === null) {
          if (calleeNode.optional) {
            return undefined;
          }
          throw new Error('Cannot call method of nullish value');
        }
        const property = calleeNode.computed
          ? evaluateFrameworkAst(calleeNode.property, scope)
          : calleeNode.property.value;
        if (SAFE_MEMBER_BLOCKLIST.has(String(property))) {
          return undefined;
        }
        fn = thisArg[property];
      } else {
        fn = evaluateFrameworkAst(calleeNode, scope);
      }

      if (typeof fn !== 'function') {
        return undefined;
      }

      const args = node.args.map((arg) => evaluateFrameworkAst(arg, scope));
      return fn.apply(thisArg, args);
    }
    default:
      throw new Error(`Unsupported expression node "${node.type}"`);
  }
}

export function evaluateFrameworkExpression(expression, scope = {}) {
  const ast = parseFrameworkExpression(expression);
  return evaluateFrameworkAst(ast, scope);
}

export function sanitizeHtmlFragment(value) {
  const html = String(value ?? '');
  if (typeof document === 'undefined') {
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z-]+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s(?:href|src|xlink:href|formaction)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, '');
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  for (const blocked of template.content.querySelectorAll('script, iframe, frame, frameset, object, embed, base, meta, link')) {
    blocked.remove();
  }

  for (const element of template.content.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc') {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (['href', 'src', 'xlink:href', 'formaction'].includes(name) && value.startsWith('javascript:')) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return template.innerHTML;
}

function shouldHandleNavigationClick(event, link) {
  if (!link || event.defaultPrevented) {
    return false;
  }

  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }

  if (link.hasAttribute('download')) {
    return false;
  }

  const target = (link.getAttribute('target') ?? '').trim().toLowerCase();
  if (target && target !== '_self') {
    return false;
  }

  const rel = (link.getAttribute('rel') ?? '').toLowerCase();
  if (rel.includes('external')) {
    return false;
  }

  return true;
}

function patchDomFromHtml(html, selector = null, mode = 'outer') {
  if (typeof document === 'undefined') {
    return;
  }

  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const nodes = [...template.content.children];

  if (selector) {
    const targets = [...document.querySelectorAll(selector)];
    if (mode === 'inner') {
      for (const target of targets) {
        target.innerHTML = html;
      }
      return;
    }

    if (mode === 'replace' || mode === 'outer') {
      for (const target of targets) {
        const replacement = nodes[0]?.cloneNode(true);
        if (replacement) {
          target.replaceWith(replacement);
        }
      }
      return;
    }
  }

  for (const node of nodes) {
    if (!node.id) {
      continue;
    }
    const current = document.getElementById(node.id);
    if (current) {
      current.replaceWith(node);
    }
  }
}

function normalizeRequestKey(candidate) {
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed ? trimmed : null;
}

function createAcceptHeader(resultMode) {
  if (resultMode === 'html') {
    return 'text/html, application/json;q=0.9, text/event-stream;q=0.8, text/javascript;q=0.7';
  }
  if (resultMode === 'state' || resultMode === 'json') {
    return 'application/json, text/html;q=0.8';
  }
  if (resultMode === 'sse') {
    return 'text/event-stream, application/json;q=0.8';
  }
  return 'application/json, text/html;q=0.8, text/event-stream;q=0.7';
}

async function readJsonResponse(response) {
  return response.json().catch(() => ({}));
}

function attachTransportModes(invoke, defaultResultMode) {
  const callable = (url, payload, options) => invoke(defaultResultMode, url, payload, options);
  callable.html = (url, payload, options) => invoke('html', url, payload, options);
  callable.json = (url, payload, options) => invoke('json', url, payload, options);
  callable.state = (url, payload, options) => invoke('state', url, payload, options);
  callable.sse = (url, payload, options) => invoke('sse', url, payload, options);
  return callable;
}

let datastarReadyPromise = null;
let datastarApi = {
  root: {},
  mergePatch(patch) {
    deepMerge(this.root, patch);
  }
};

async function ensureDatastarApi() {
  if (typeof window === 'undefined') {
    return datastarApi;
  }

  if (!datastarReadyPromise) {
    datastarReadyPromise = import(DATASTAR_BUNDLE_URL).then((module) => {
      datastarApi = module;
      return module;
    });
  }

  return datastarReadyPromise;
}

function snapshotSignals() {
  return clone(datastarApi.root ?? {});
}

function readJsonScript(id, fallback = null) {
  if (typeof document === 'undefined') {
    return fallback;
  }

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

async function invokeServerModule(kind, moduleUrl, method, args) {
  const csrfToken = typeof document === 'undefined'
    ? null
    : document.querySelector('meta[name="brackets-csrf"]')?.getAttribute('content') ?? null;
  const response = await fetch('/__brackets/rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-Brackets-CSRF': csrfToken } : {})
    },
    body: JSON.stringify({ kind, moduleUrl, method, args })
  });
  const payload = await readJsonResponse(response);
  return payload.result;
}

function normalizeRoutePath(route) {
  if (!route || route === '/') {
    return '/';
  }

  const normalized = route.startsWith('/') ? route : `/${route}`;
  return normalized.length > 1
    ? normalized.replace(/\/+$/, '')
    : normalized;
}

function buildRouteMatcher(pattern) {
  const keys = [];
  const normalized = normalizeRoutePath(pattern);
  const routePattern = normalized
    .split('/')
    .map((segment, index) => {
      if (index === 0) {
        return '';
      }

      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '/([^/]+)';
      }

      if (segment.startsWith('*')) {
        const key = segment.slice(1) || 'splat';
        keys.push(key);
        return '/(.*)';
      }

      return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
    })
    .join('');

  return {
    keys,
    regex: new RegExp(`^${routePattern}$`)
  };
}

function extractRouteParams(routeKeys, match) {
  const params = {};
  routeKeys.forEach((key, index) => {
    params[key] = decodeURIComponent(match[index + 1]);
  });
  return params;
}

export function parseRoute(pattern, pathname) {
  const matcher = buildRouteMatcher(pattern);
  const match = pathname.match(matcher.regex);
  if (!match) {
    return null;
  }

  return extractRouteParams(matcher.keys, match);
}

export function createLocationSnapshot(target, origin = 'http://127.0.0.1') {
  const url = target instanceof URL ? target : new URL(target, origin);
  return {
    href: url.href,
    path: `${url.pathname}${url.search}${url.hash}`,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash
  };
}

export function buildNavigationPlan(current, layout, nextRoute) {
  if (!current) {
    return {
      preserveLayout: false,
      preservePage: false,
      layoutChanged: true,
      pageChanged: true,
      shouldMount: true,
      shouldSync: false
    };
  }

  const currentLayoutUrl = layout?.url ?? null;
  const nextLayoutUrl = nextRoute?.layoutUrl ?? null;
  const preserveLayout = currentLayoutUrl === nextLayoutUrl;
  const preservePage = preserveLayout
    && current.route?.id === nextRoute?.id
    && current.route?.htmlUrl === nextRoute?.htmlUrl
    && current.route?.logicUrl === nextRoute?.logicUrl;

  return {
    preserveLayout,
    preservePage,
    layoutChanged: !preserveLayout,
    pageChanged: !preservePage,
    shouldMount: !preservePage,
    shouldSync: preservePage
  };
}

export function normalizeRouterRedirect(result) {
  if (!result) {
    return null;
  }

  if (typeof result === 'string') {
    return {
      path: result,
      replace: true
    };
  }

  if (typeof result === 'object') {
    const path = result.redirectTo ?? result.path ?? result.href ?? null;
    if (!path) {
      return null;
    }

    return {
      path,
      replace: result.replace ?? true
    };
  }

  return null;
}

export function resolveNotFoundResult(result, currentPath = null, origin = 'http://127.0.0.1') {
  const redirect = normalizeRouterRedirect(result);
  if (redirect) {
    const nextRedirectPath = createLocationSnapshot(redirect.path, origin).path;
    const activePath = currentPath
      ? createLocationSnapshot(currentPath, origin).path
      : null;

    if (activePath && nextRedirectPath === activePath) {
      return {
        kind: 'default',
        result,
        updateHistory: true
      };
    }

    return {
      kind: 'redirect',
      redirect,
      updateHistory: false
    };
  }

  if (result && typeof result === 'object' && typeof result.html === 'string') {
    return {
      kind: 'html',
      result,
      updateHistory: true
    };
  }

  return {
    kind: 'default',
    result,
    updateHistory: true
  };
}

export function extendNavigationRedirectChain(chain = [], nextPath, origin = 'http://127.0.0.1', limit = MAX_NAVIGATION_REDIRECTS) {
  const history = Array.isArray(chain) ? [...chain] : [];
  const normalizedPath = createLocationSnapshot(nextPath, origin).path;

  if (history.includes(normalizedPath)) {
    const error = new Error(`Redirect loop detected for "${normalizedPath}"`);
    error.code = 'BRACKETS_NAVIGATION_REDIRECT_LOOP';
    error.path = normalizedPath;
    error.chain = [...history, normalizedPath];
    throw error;
  }

  const nextChain = [...history, normalizedPath];
  if (nextChain.length > limit) {
    const error = new Error(`Redirect chain exceeded ${limit} hops.`);
    error.code = 'BRACKETS_NAVIGATION_REDIRECT_LIMIT';
    error.path = normalizedPath;
    error.chain = nextChain;
    throw error;
  }

  return nextChain;
}

export function formDataToObject(formData) {
  const output = {};

  if (!formData?.entries) {
    return output;
  }

  for (const [key, value] of formData.entries()) {
    if (!(key in output)) {
      output[key] = value;
      continue;
    }

    output[key] = Array.isArray(output[key])
      ? [...output[key], value]
      : [output[key], value];
  }

  return output;
}

function normalizeRouteAliases(route) {
  return [
    ...(route.alias ? [route.alias] : []),
    ...(Array.isArray(route.aliases) ? route.aliases : [])
  ];
}

function prepareRuntimeRoute(route = {}) {
  const matcher = route.routePattern
    ? new RegExp(route.routePattern)
    : buildRouteMatcher(route.route).regex;
  const paramValidators = Object.fromEntries(Object.entries(route.params ?? {}).flatMap(([name, pattern]) => {
    if (typeof pattern !== 'string' || !pattern) {
      return [];
    }
    return [[name, new RegExp(pattern)]];
  }));

  return {
    ...route,
    _matcher: matcher,
    _paramValidators: paramValidators
  };
}

function appendTargetQuery(searchParams, query) {
  if (!query) {
    return;
  }

  if (query instanceof URLSearchParams || query instanceof FormData) {
    for (const [key, value] of query.entries()) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          searchParams.append(key, String(item));
        }
      }
      continue;
    }

    searchParams.append(key, String(value));
  }
}

function fillRoutePath(pattern, params = {}) {
  const normalized = pattern === '/' ? '/' : `/${String(pattern ?? '').replace(/^\/+/, '')}`;
  const used = new Set();
  const pathname = normalized.replace(/:([A-Za-z0-9_]+)|\*([A-Za-z0-9_]*)/g, (_, namedKey, splatKey) => {
    const key = namedKey ?? splatKey ?? 'splat';
    const value = params[key];
    if (value === undefined || value === null || value === '') {
      const error = new Error(`Missing route param "${key}" for "${pattern}"`);
      error.code = 'BRACKETS_ROUTE_PARAM_MISSING';
      error.param = key;
      error.pattern = pattern;
      throw error;
    }
    used.add(key);
    const encoded = String(value)
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return encoded;
  });

  return {
    pathname,
    usedParams: used
  };
}

function findRouteById(routes, id) {
  const matches = routes.filter((route) => route.id === id);
  if (!matches.length) {
    const error = new Error(`Unknown route id "${id}"`);
    error.code = 'BRACKETS_ROUTE_UNKNOWN';
    error.routeId = id;
    throw error;
  }

  return matches.find((route) => !route.aliasOf) ?? matches[0];
}

export function buildRouteHref(routes, target, origin = 'http://127.0.0.1') {
  if (typeof target === 'string' || target instanceof URL) {
    return createLocationSnapshot(target, origin).path;
  }

  if (!target || typeof target !== 'object') {
    const error = new Error('Route target must be a path string, URL, or route target object.');
    error.code = 'BRACKETS_ROUTE_TARGET_INVALID';
    throw error;
  }

  const directPath = target.path ?? target.href ?? target.route ?? null;
  const selectedRoute = target.id ? findRouteById(routes, target.id) : null;
  const basePattern = directPath ?? selectedRoute?.route ?? null;

  if (!basePattern) {
    const error = new Error('Route target requires either "id" or "path".');
    error.code = 'BRACKETS_ROUTE_TARGET_INVALID';
    throw error;
  }

  const nextUrl = new URL(origin);
  const { pathname } = fillRoutePath(basePattern, target.params ?? {});
  nextUrl.pathname = pathname;
  nextUrl.search = '';
  nextUrl.hash = '';
  appendTargetQuery(nextUrl.searchParams, target.query ?? null);

  if (target.hash !== undefined && target.hash !== null && target.hash !== '') {
    nextUrl.hash = String(target.hash).startsWith('#')
      ? String(target.hash)
      : `#${String(target.hash)}`;
  }

  return createLocationSnapshot(nextUrl, origin).path;
}

function hasExplicitTargetSearch(target) {
  return Boolean(
    target
    && typeof target === 'object'
    && (Object.hasOwn(target, 'query') || Object.hasOwn(target, 'hash'))
  );
}

function isNavigationTargetActive(app, target, options = {}) {
  const origin = typeof window === 'undefined' ? 'http://127.0.0.1' : window.location.origin;
  const currentPath = app.lastRouteSnapshot?.location?.path
    ?? app.current?.location?.path
    ?? (typeof window === 'undefined'
      ? app.initialPath
      : `${window.location.pathname}${window.location.search}${window.location.hash}`);
  const nextPath = app.resolveNavigationTarget(target);
  const currentLocation = createLocationSnapshot(currentPath, origin);
  const nextLocation = createLocationSnapshot(nextPath, origin);

  if (options.exact === false) {
    return currentLocation.pathname === nextLocation.pathname
      || currentLocation.pathname.startsWith(`${nextLocation.pathname.replace(/\/+$/, '')}/`);
  }

  if (!hasExplicitTargetSearch(target)) {
    return currentLocation.pathname === nextLocation.pathname;
  }

  return currentLocation.path === nextLocation.path;
}

function validateRouteParams(route, params) {
  for (const [name, matcher] of Object.entries(route?._paramValidators ?? {})) {
    const value = params?.[name];
    if (value === undefined) {
      return false;
    }

    if (!matcher.test(String(value))) {
      return false;
    }
  }

  return true;
}

export class BracketsApp {
  constructor(config) {
    this.routes = (config.routes ?? []).map((route) => prepareRuntimeRoute(route));
    this.router = config.router ?? { mode: 'file', logicUrl: null, sources: {}, hooks: {} };
    this.host = config.host ?? readJsonScript('brackets-host', {});
    this.security = config.security ?? { html: 'sanitize' };
    this.sessionState = config.session ?? readJsonScript('brackets-session', { authenticated: false, user: null });
    this.routesById = new Map();
    for (const route of this.routes) {
      if (!route?.id || (this.routesById.has(route.id) && route.aliasOf)) {
        continue;
      }
      this.routesById.set(route.id, route);
    }
    this.routerLogic = null;
    this.current = null;
    this.layout = null;
    this.actionContext = null;
    this.navigationToken = 0;
    this.lastRouteSnapshot = null;
    this.textCache = new Map();
    this.moduleCache = new Map();
    this.routeAssetCache = new Map();
    this.componentCache = new Map();
    this.resourceCache = new Map();
    this.resourceCacheEpoch = new Map();
    this.resourceCacheVersion = 0;
    this.pendingFrameworkRender = false;
    this.activeRequests = new Map();
    this.sessionPromise = null;
    this.routeState = {
      loading: false,
      error: null
    };
    this.serviceWorkerRegistration = null;
    this.nav = this.createNavHelpers();
    this.request = this.createTransportCallable('GET', 'html');
    this.get = this.createTransportCallable('GET', 'html');
    this.create = this.createTransportCallable('POST', 'html');
    this.update = this.createTransportCallable('PUT', 'html');
    this.patch = this.createTransportCallable('PATCH', 'state');
    this.delete = this.createTransportCallable('DELETE', 'html');
    this.read = this.createTransportCallable('GET', 'sse');
    this.initialPath = typeof window === 'undefined'
      ? '/'
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  createTransportCallable(method, defaultResultMode) {
    return attachTransportModes(
      (resultMode, url, payload, options) => this.performTransport(method, resultMode, url, payload, options),
      defaultResultMode
    );
  }

  async flushDatastar() {
    if (typeof window === 'undefined') {
      return;
    }

    await Promise.resolve();
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  patchSignals(patch) {
    if (!patch || typeof patch !== 'object') {
      return;
    }

    datastarApi.mergePatch(clone(patch));
    this.scheduleFrameworkRender();
  }

  scheduleFrameworkRender(instance = this.current) {
    if (!instance || this.pendingFrameworkRender) {
      return;
    }

    this.pendingFrameworkRender = true;
    queueMicrotask(() => {
      const finalize = () => {
        this.pendingFrameworkRender = false;
        if (instance === this.current) {
          this.renderBindings(instance);
        }
      };

      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(finalize);
        return;
      }

      finalize();
    });
  }

  fetchTextCached(url) {
    if (!this.textCache.has(url)) {
      this.textCache.set(url, fetch(url)
        .then((response) => response.text())
        .catch((error) => {
          this.textCache.delete(url);
          throw error;
        }));
    }
    return this.textCache.get(url);
  }

  importModuleCached(url) {
    if (!this.moduleCache.has(url)) {
      this.moduleCache.set(url, import(url)
        .then((module) => module.default)
        .catch((error) => {
          this.moduleCache.delete(url);
          throw error;
        }));
    }
    return this.moduleCache.get(url);
  }

  warmRoute(route) {
    if (!route) {
      return Promise.resolve();
    }

    const cacheKey = route.id ?? route.route ?? route.htmlUrl;
    if (!this.routeAssetCache.has(cacheKey)) {
      const pending = Promise.all([
        route.htmlUrl ? this.fetchTextCached(route.htmlUrl) : null,
        route.layoutUrl ? this.fetchTextCached(route.layoutUrl) : null,
        route.logicUrl ? this.importModuleCached(route.logicUrl) : {}
      ]).catch((error) => {
        this.routeAssetCache.delete(cacheKey);
        throw error;
      });
      this.routeAssetCache.set(cacheKey, pending);
    }

    return this.routeAssetCache.get(cacheKey);
  }

  shouldWarmRoute(route, currentPath = null) {
    const activeRoute = this.lastRouteSnapshot?.route ?? this.current?.route ?? null;
    const activeRouteId = activeRoute?.id ?? null;
    const activeCanonicalPath = activeRoute
      ? activeRoute.aliasOf ?? activeRoute.route ?? null
      : null;
    const effectiveCurrentPath = currentPath
      ?? this.lastRouteSnapshot?.location?.pathname
      ?? (typeof window === 'undefined' ? null : window.location.pathname)
      ?? null;

    if (effectiveCurrentPath && route.route === effectiveCurrentPath) {
      return false;
    }
    if (activeRouteId && route.id === activeRouteId) {
      return false;
    }
    const candidateCanonicalPath = route.aliasOf ?? route.route ?? null;
    if (activeCanonicalPath && candidateCanonicalPath === activeCanonicalPath) {
      return false;
    }
    return true;
  }

  prefetchPath(nextPath) {
    if (typeof window === 'undefined') {
      return;
    }

    const nextLocation = createLocationSnapshot(nextPath, window.location.origin);
    const matched = this.matchRoute(nextLocation.pathname);
    if (!matched) {
      return;
    }

    if (!this.shouldWarmRoute(matched.route)) {
      return;
    }

    void this.warmRoute(matched.route).catch(() => {});
  }

  scheduleConfiguredPrefetch() {
    if (typeof window === 'undefined') {
      return;
    }

    const currentPath = this.lastRouteSnapshot?.location?.pathname
      ?? window.location.pathname
      ?? createLocationSnapshot(this.initialPath, window.location.origin).pathname;
    const renderRoutes = this.routes.filter((route) => route.preload === 'render' && this.shouldWarmRoute(route, currentPath));
    const idleRoutes = this.routes.filter((route) => route.preload === 'idle' && this.shouldWarmRoute(route, currentPath));

    for (const route of renderRoutes) {
      void this.warmRoute(route).catch(() => {});
    }

    if (!idleRoutes.length) {
      return;
    }

    const warmIdleRoutes = () => {
      for (const route of idleRoutes) {
        void this.warmRoute(route).catch(() => {});
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(warmIdleRoutes);
      return;
    }

    window.setTimeout(warmIdleRoutes, 120);
  }

  buildRouteContext(route, params, location) {
    const routeLocation = location ?? createLocationSnapshot(window.location.href, window.location.origin);
    const app = this;
    return {
      id: route?.id ?? null,
      pattern: route?.route ?? null,
      aliasOf: route?.aliasOf ?? null,
      aliases: route ? normalizeRouteAliases(route) : [],
      path: routeLocation.path,
      pathname: routeLocation.pathname,
      search: routeLocation.search,
      hash: routeLocation.hash,
      params,
      queryAll() {
        const values = {};
        for (const [key, value] of new URLSearchParams(routeLocation.search).entries()) {
          const previous = values[key];
          if (previous === undefined) {
            values[key] = value;
            continue;
          }
          values[key] = Array.isArray(previous) ? [...previous, value] : [previous, value];
        }
        return values;
      },
      param(name) {
        return params[name];
      },
      query(name) {
        return new URLSearchParams(routeLocation.search).get(name) ?? undefined;
      },
      href(next = {}) {
        if (!route?.id && !route?.route) {
          return routeLocation.path;
        }

        const target = {
          id: route?.id ?? undefined,
          path: route?.route ?? undefined,
          params: { ...(params ?? {}), ...(next.params ?? {}) }
        };
        if (Object.hasOwn(next, 'query')) {
          target.query = next.query;
        }
        if (Object.hasOwn(next, 'hash')) {
          target.hash = next.hash;
        }
        return app.resolveNavigationTarget(target);
      },
      isActive(next = {}) {
        const target = {
          id: route?.id ?? undefined,
          path: route?.route ?? undefined,
          params: { ...(params ?? {}), ...(next.params ?? {}) }
        };
        if (Object.hasOwn(next, 'query')) {
          target.query = next.query;
        }
        if (Object.hasOwn(next, 'hash')) {
          target.hash = next.hash;
        }
        return isNavigationTargetActive(app, target);
      }
    };
  }

  buildRouterHookContext(nextLocation, matched = null) {
    const from = this.lastRouteSnapshot
      ? {
          route: this.lastRouteSnapshot.route,
          location: { ...this.lastRouteSnapshot.location },
          ...this.buildRouteContext(
            this.lastRouteSnapshot.route,
            clone(this.lastRouteSnapshot.params ?? {}),
            this.lastRouteSnapshot.location
          )
        }
      : null;
    const toRouteContext = this.buildRouteContext(
      matched?.route ?? null,
      clone(matched?.params ?? {}),
      nextLocation
    );

    return {
      to: {
        route: matched?.route ?? null,
        location: { ...nextLocation },
        ...toRouteContext
      },
      from,
      routes: this.routes.map((route) => ({
        id: route.id,
        route: route.route,
        aliases: normalizeRouteAliases(route),
        title: route.title ?? '',
        source: route.source ?? 'view',
        preload: route.preload ?? null,
        aliasOf: route.aliasOf ?? null,
        href: (next = {}) => this.resolveNavigationTarget({
          id: route.id ?? undefined,
          path: route.route ?? undefined,
          params: next.params ?? {},
          ...(Object.hasOwn(next, 'query') ? { query: next.query } : {}),
          ...(Object.hasOwn(next, 'hash') ? { hash: next.hash } : {})
        })
      })),
      session: clone(this.sessionState ?? { authenticated: false, user: null }),
      host: clone(this.host ?? {}),
      nav: this.nav,
      auth: {
        session: () => this.getSession(),
        refresh: () => this.getSession(true)
      }
    };
  }

  async runRouterHook(name, nextLocation, matched = null) {
    const hook = this.routerLogic?.[name];
    if (typeof hook !== 'function') {
      return null;
    }

    return hook(this.buildRouterHookContext(nextLocation, matched));
  }

  getCsrfToken() {
    if (typeof document === 'undefined') {
      return null;
    }

    return document.querySelector('meta[name="brackets-csrf"]')?.getAttribute('content') ?? null;
  }

  async getSession(force = false) {
    if (!force && this.sessionState) {
      return this.sessionState;
    }

    if (this.sessionPromise) {
      return this.sessionPromise;
    }

    this.sessionPromise = fetch('/__brackets/session', {
      headers: {
        Accept: 'application/json'
      }
    }).then(async (response) => {
      const session = await readJsonResponse(response);
      if (!response.ok) {
        throw this.createTransportError(response, session);
      }
      return session;
    }).then((session) => {
        this.sessionState = session;
        return session;
      })
      .finally(() => {
        this.sessionPromise = null;
      });

    return this.sessionPromise;
  }

  async resolveRouteSession(route) {
    if (!route?.auth?.required) {
      return this.sessionState;
    }

    const knownSession = this.sessionState;
    const shouldRefresh = !knownSession?.authenticated;
    const session = await this.getSession(shouldRefresh);
    return session?.authenticated ? session : null;
  }

  async cacheFetch(key, loader, options = {}) {
    const normalized = normalizeRequestKey(key) ?? snapshotKey(key);
    const cacheToken = {
      version: this.resourceCacheVersion,
      epoch: this.resourceCacheEpoch.get(normalized) ?? 0
    };
    const now = Date.now();
    const cached = this.resourceCache.get(normalized);
    const ttlMs = Math.max(0, options.ttlMs ?? 0);
    const staleMs = Math.max(ttlMs, options.staleMs ?? ttlMs);
    const isFresh = cached && now - cached.updatedAt <= ttlMs;
    const isStale = cached && now - cached.updatedAt <= staleMs;

    if (!options.force && isFresh) {
      return cached.value;
    }

    if (cached?.promise) {
      if (!options.force && isStale && cached.value !== undefined) {
        return cached.value;
      }
      return cached.promise;
    }

    const nextEntry = {
      value: cached?.value,
      updatedAt: cached?.updatedAt ?? 0,
      promise: null
    };

    const promise = Promise.resolve().then(loader).then((value) => {
      if (this.resourceCacheVersion !== cacheToken.version || (this.resourceCacheEpoch.get(normalized) ?? 0) !== cacheToken.epoch) {
        return value;
      }
      this.resourceCache.set(normalized, {
        value: clone(value),
        updatedAt: Date.now(),
        promise: null
      });
      return value;
    }).catch((error) => {
      if (this.resourceCacheVersion !== cacheToken.version || (this.resourceCacheEpoch.get(normalized) ?? 0) !== cacheToken.epoch) {
        throw error;
      }
      if (cached) {
        nextEntry.promise = null;
        nextEntry.value = cached.value;
        nextEntry.updatedAt = cached.updatedAt;
        this.resourceCache.set(normalized, nextEntry);
      } else {
        this.resourceCache.delete(normalized);
      }
      throw error;
    });

    nextEntry.promise = promise;
    this.resourceCache.set(normalized, nextEntry);

    if (!options.force && isStale && cached) {
      promise.catch(() => {});
      return cached.value;
    }

    return promise;
  }

  invalidateCache(key = null) {
    if (key === null || key === undefined) {
      this.resourceCache.clear();
      this.resourceCacheVersion += 1;
      return;
    }

    const normalized = normalizeRequestKey(key) ?? snapshotKey(key);
    this.resourceCache.delete(normalized);
    this.resourceCacheEpoch.set(normalized, (this.resourceCacheEpoch.get(normalized) ?? 0) + 1);
  }

  getRequestEntry(instance, key) {
    if (!instance.requestState) {
      instance.requestState = {};
    }

    const normalized = normalizeRequestKey(key);
    if (!normalized) {
      return null;
    }

    instance.requestState[normalized] ??= {
      pending: 0,
      loading: false,
      error: null
    };

    return instance.requestState[normalized];
  }

  beginRequest(instance, key) {
    const entry = this.getRequestEntry(instance, key);
    if (!entry) {
      return;
    }
    entry.pending += 1;
    entry.loading = true;
    entry.error = null;
    this.emitDebugEvent('request-state', {
      key: normalizeRequestKey(key),
      loading: true,
      error: null
    });
  }

  finishRequest(instance, key, error = null) {
    const entry = this.getRequestEntry(instance, key);
    if (!entry) {
      return;
    }
    entry.pending = Math.max(0, entry.pending - 1);
    entry.loading = entry.pending > 0;
    entry.error = error;
    this.emitDebugEvent('request-state', {
      key: normalizeRequestKey(key),
      loading: entry.loading,
      error: error ? String(error.message ?? error) : null
    });
  }

  beginTransportState(instance) {
    instance.transportState ??= {
      loading: false,
      error: null,
      pending: 0,
      latestRequestId: 0
    };
    instance.transportState.pending = Math.max(0, instance.transportState.pending ?? 0) + 1;
    instance.transportState.latestRequestId = (instance.transportState.latestRequestId ?? 0) + 1;
    instance.transportState.loading = true;
    instance.transportState.error = null;
    return instance.transportState.latestRequestId;
  }

  finishTransportState(instance, requestId, error = null) {
    instance.transportState ??= {
      loading: false,
      error: null,
      pending: 0,
      latestRequestId: 0
    };
    instance.transportState.pending = Math.max(0, (instance.transportState.pending ?? 0) - 1);
    instance.transportState.loading = instance.transportState.pending > 0;
    if ((instance.transportState.latestRequestId ?? 0) === requestId) {
      instance.transportState.error = error;
    }
  }

  inferTransportKey(url, options = {}) {
    return normalizeRequestKey(options.key)
      ?? normalizeRequestKey(options.name)
      ?? (() => {
        try {
          const parsed = new URL(url, typeof window === 'undefined' ? 'http://127.0.0.1' : window.location.origin);
          const segments = parsed.pathname.split('/').filter(Boolean);
          return normalizeRequestKey(segments.at(-1));
        } catch {
          return null;
        }
      })();
  }

  resolveFormPayload(options = {}) {
    if (options.payload instanceof FormData) {
      return options.payload;
    }

    if (typeof document === 'undefined') {
      return null;
    }

    const selector = options.selector ?? null;
    const supportsElement = typeof Element !== 'undefined';
    const form = supportsElement && selector instanceof Element
      ? selector
      : selector
        ? document.querySelector(selector)
        : this.actionContext?.element?.closest?.('form') ?? null;
    if (!form) {
      return null;
    }

    const formData = new FormData(form);
    if (options.payload && typeof options.payload === 'object' && !(options.payload instanceof FormData)) {
      for (const [key, value] of Object.entries(options.payload)) {
        if (Array.isArray(value)) {
          formData.delete(key);
          for (const item of value) {
            if (item !== undefined && item !== null) {
              formData.append(key, item instanceof Blob ? item : String(item));
            }
          }
          continue;
        }

        if (value !== undefined && value !== null) {
          formData.set(key, value instanceof Blob ? value : String(value));
        }
      }
    }
    return formData;
  }

  appendQueryPayload(requestUrl, payload) {
    if (!payload) {
      return;
    }

    if (payload instanceof URLSearchParams || payload instanceof FormData) {
      for (const [key, value] of payload.entries()) {
        if (value !== undefined && value !== null) {
          requestUrl.searchParams.append(key, String(value));
        }
      }
      return;
    }

    const entries = Object.entries(payload);

    for (const [key, value] of entries) {
      if (value === undefined || value === null) {
        continue;
      }

      if (Array.isArray(value)) {
        requestUrl.searchParams.delete(key);
        for (const item of value) {
          if (item !== undefined && item !== null) {
            requestUrl.searchParams.append(key, String(item));
          }
        }
        continue;
      }

      requestUrl.searchParams.set(key, String(value));
    }
  }

  createTransportError(response, payload) {
    const message = typeof payload === 'string' && payload.trim()
      ? payload.trim()
      : payload?.error?.trim?.()
        ? payload.error.trim()
        : `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    if (payload && typeof payload === 'object') {
      error.code = payload.code ?? null;
      error.issues = Array.isArray(payload.issues) ? payload.issues : [];
      error.hint = payload.hint ?? null;
    }
    return error;
  }

  createSseTransportError(event = null) {
    const error = new Error('SSE stream failed to connect or stay open.');
    error.code = 'BRACKETS_SSE_ERROR';
    error.payload = event;
    error.hint = 'Check the SSE endpoint, same-origin host path, and network availability.';
    return error;
  }

  async readTransportResponse(response, resultMode) {
    const contentType = response.headers.get('content-type') ?? '';

    if (resultMode === 'html' || contentType.includes('text/html')) {
      return {
        contentType,
        payload: await response.text()
      };
    }

    if (contentType.includes('application/json')) {
      return {
        contentType,
        payload: await readJsonResponse(response)
      };
    }

    return {
      contentType,
      payload: await response.text()
    };
  }

  createEventStreamUrl(url, payload, options = {}) {
    const requestUrl = new URL(url, typeof window === 'undefined' ? 'http://127.0.0.1' : window.location.origin);
    this.appendQueryPayload(requestUrl, options.payload ?? payload);
    return requestUrl;
  }

  createFetchRequest(method, resultMode, url, payload, options = {}) {
    const headers = new Headers({
      Accept: createAcceptHeader(resultMode),
      'X-Requested-With': 'Brackets',
      'Datastar-Request': 'true',
      ...(options.headers ?? {})
    });
    const csrfToken = this.getCsrfToken();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken && !headers.has('X-Brackets-CSRF')) {
      headers.set('X-Brackets-CSRF', csrfToken);
    }

    const requestUrl = new URL(url, typeof window === 'undefined' ? 'http://127.0.0.1' : window.location.origin);
    const effectivePayload = options.payload ?? payload;
    let body;

    if (options.contentType === 'form') {
      body = this.resolveFormPayload({
        ...options,
        payload: effectivePayload
      });
    } else if (options.contentType === 'text/plain') {
      headers.set('Content-Type', 'text/plain; charset=utf-8');
      body = typeof effectivePayload === 'string' ? effectivePayload : String(effectivePayload ?? '');
    } else if (options.contentType === 'application/octet-stream') {
      headers.set('Content-Type', 'application/octet-stream');
      body = effectivePayload;
    } else if (effectivePayload instanceof Blob || effectivePayload instanceof ArrayBuffer || ArrayBuffer.isView(effectivePayload)) {
      body = effectivePayload;
    } else if (effectivePayload !== undefined && method !== 'GET' && method !== 'HEAD') {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(effectivePayload);
    }

    if (method === 'GET' || method === 'HEAD') {
      this.appendQueryPayload(requestUrl, effectivePayload);
    }

    const requestCancellation = options.requestCancellation;
    const cancellationMode = typeof requestCancellation === 'string'
      ? requestCancellation
      : 'auto';
    let controller = options.abortController
      ?? (requestCancellation instanceof AbortController ? requestCancellation : null);
    const requestKey = this.inferTransportKey(url, options);
    if (!controller && cancellationMode !== 'disabled' && requestKey) {
      this.activeRequests.get(requestKey)?.abort();
      controller = new AbortController();
      this.activeRequests.set(requestKey, controller);
    }

    return {
      url: requestUrl,
      headers,
      body,
      controller,
      requestKey
    };
  }

  getBindingRequestKey(instance, expression) {
    const direct = normalizeRequestKey(expression);
    if (direct && instance.requestState?.[direct]) {
      return direct;
    }

    try {
      const value = this.evaluate(instance, expression);
      if (typeof value === 'string') {
        return normalizeRequestKey(value);
      }
    } catch {
      return direct;
    }

    return direct;
  }

  createModuleProxy(kind, mapping = {}) {
    const rootProxy = {};
    for (const [name, moduleUrl] of Object.entries(mapping)) {
      rootProxy[name] = new Proxy({}, {
        get: (_, method) => {
          if (typeof method !== 'string') {
            return undefined;
          }

          return async (...args) => {
            const instance = this.current;
            const requestKey = normalizeRequestKey(name);
            if (instance) {
              this.beginRequest(instance, requestKey);
              this.scheduleFrameworkRender(instance);
            }

            try {
              const result = await invokeServerModule(kind, moduleUrl, method, args);
              if (instance) {
                this.finishRequest(instance, requestKey, null);
                this.scheduleFrameworkRender(instance);
              }
              return result;
            } catch (error) {
              if (instance) {
                this.finishRequest(instance, requestKey, error);
                this.scheduleFrameworkRender(instance);
              }
              throw error;
            }
          };
        }
      });
    }
    return rootProxy;
  }

  createNavHelpers() {
    const app = this;
    return {
      to(target, nextOptions = {}) {
        return app.navigate(app.resolveNavigationTarget(target), nextOptions);
      },
      replace(target, nextOptions = {}) {
        return app.navigate(app.resolveNavigationTarget(target), { ...nextOptions, replace: true });
      },
      back() {
        history.back();
      },
      forward() {
        history.forward?.();
      },
      reload(nextOptions = {}) {
        return app.navigate(window.location.pathname + window.location.search + window.location.hash, {
          ...nextOptions,
          replace: true
        });
      },
      redirect(target, nextOptions = {}) {
        return app.navigate(app.resolveNavigationTarget(target), { ...nextOptions, replace: true });
      },
      notFound(nextOptions = {}) {
        return app.renderNotFound(createLocationSnapshot(window.location.pathname + window.location.search + window.location.hash, window.location.origin), nextOptions);
      },
      prefetch(target) {
        return app.prefetchPath(app.resolveNavigationTarget(target));
      },
      href(target) {
        return app.resolveNavigationTarget(target);
      },
      isActive(target, options = {}) {
        return isNavigationTargetActive(app, target, options);
      },
      match(target) {
        const nextPath = app.resolveNavigationTarget(target);
        const nextLocation = createLocationSnapshot(nextPath, window.location.origin);
        return app.matchRoute(nextLocation.pathname);
      },
      download(pathname, filename = null) {
        if (typeof window === 'undefined') {
          return;
        }
        const url = new URL(pathname, window.location.origin);
        if (filename) {
          url.searchParams.set('download', filename);
        } else if (!url.searchParams.has('download')) {
          url.searchParams.set('download', '1');
        }
        window.location.assign(url.href);
      }
    };
  }

  resolveNavigationTarget(target) {
    return buildRouteHref(
      this.routes,
      target,
      typeof window === 'undefined' ? 'http://127.0.0.1' : window.location.origin
    );
  }

  createCtx(instance) {
    const app = this;
    return {
      route: this.buildRouteContext(instance.route, instance.params, instance.location),
      state: {
        get() {
          return snapshotSignals();
        },
        set(patch) {
          app.patchSignals(patch);
        },
        replace(next) {
          app.patchSignals(next);
        },
        async optimistic(patch, task) {
          const previous = snapshotSignals();
          app.patchSignals(typeof patch === 'function' ? patch(previous) : patch);
          try {
            return await task();
          } catch (error) {
            datastarApi.root = clone(previous);
            app.scheduleFrameworkRender(instance);
            throw error;
          }
        },
        invalidate(key) {
          app.invalidateCache(key);
        },
        validation(name, error) {
          const key = normalizeRequestKey(name) ?? 'validation';
          const entry = app.getRequestEntry(instance, key);
          if (!entry) {
            return;
          }
          entry.error = error;
          entry.loading = false;
          entry.pending = 0;
          app.scheduleFrameworkRender(instance);
        }
      },
      action: {
        event: this.actionContext?.event ?? null,
        el: this.actionContext?.element ?? null,
        input() {
          const target = this.el;
          if (!target) {
            return null;
          }

          const form = target.closest('form');
          if (!form) {
            return target.value ?? null;
          }

          return formDataToObject(new FormData(form));
        },
        formData() {
          const target = this.el;
          const form = target?.closest?.('form') ?? null;
          return form ? new FormData(form) : null;
        },
        files(name = null) {
          const target = this.el;
          const form = target?.closest?.('form') ?? null;
          const fileInputs = form
            ? Array.from(form.querySelectorAll('input[type="file"]'))
            : target?.matches?.('input[type="file"]')
              ? [target]
              : [];
          if (name) {
            const input = fileInputs.find((element) => element.name === name || element.id === name);
            return input ? Array.from(input.files ?? []) : [];
          }
          return fileInputs.flatMap((input) => Array.from(input.files ?? []));
        }
      },
      api: this.createModuleProxy('api', instance.route.api),
      data: this.createModuleProxy('data', instance.route.data),
      nav: this.nav,
      cache: {
        get: (key) => this.resourceCache.get(normalizeRequestKey(key) ?? snapshotKey(key))?.value,
        fetch: (key, loader, options) => this.cacheFetch(key, loader, options),
        invalidate: (key) => this.invalidateCache(key),
        refresh: (key, loader, options = {}) => this.cacheFetch(key, loader, { ...options, force: true })
      },
      auth: {
        session: (force = false) => this.getSession(force),
        async refresh() {
          return app.getSession(true);
        },
        get token() {
          return app.getCsrfToken();
        },
        get user() {
          return app.sessionState?.user ?? null;
        },
        get authenticated() {
          return Boolean(app.sessionState?.authenticated);
        }
      },
      loading(name) {
        const key = normalizeRequestKey(name);
        if (!key) {
          return instance.transportState.loading;
        }
        if (key === 'route') {
          return app.routeState.loading;
        }
        return instance.requestState?.[key]?.loading ?? false;
      },
      error(name) {
        const key = normalizeRequestKey(name);
        if (!key) {
          return instance.transportState.error;
        }
        if (key === 'route') {
          return app.routeState.error;
        }
        return instance.requestState?.[key]?.error ?? null;
      },
      cleanup(callback) {
        instance.cleanups.push(callback);
      }
    };
  }

  async start() {
    if (this.router.logicUrl) {
      this.routerLogic = await this.importModuleCached(this.router.logicUrl).catch(() => null);
    }

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!shouldHandleNavigationClick(event, link)) {
        return;
      }

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }

      event.preventDefault();
      void this.navigate(url.pathname + url.search + url.hash);
    });

    const prefetchLink = (target) => {
      const link = target?.closest?.('a[href]');
      if (!link || link.hasAttribute('download')) {
        return;
      }

      const targetValue = (link.getAttribute('target') ?? '').trim().toLowerCase();
      if (targetValue && targetValue !== '_self') {
        return;
      }

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }

      this.prefetchPath(url.pathname + url.search + url.hash);
    };

    document.addEventListener('pointerenter', (event) => {
      prefetchLink(event.target);
    }, true);

    document.addEventListener('focusin', (event) => {
      prefetchLink(event.target);
    });

    document.addEventListener('datastar-signal-patch', () => {
      this.scheduleFrameworkRender();
    });

    window.addEventListener('popstate', () => {
      void this.navigate(window.location.pathname + window.location.search + window.location.hash, {
        historyChange: false
      });
    });

    this.attachDevtoolsBridge();
    await this.registerServiceWorker();
    this.scheduleConfiguredPrefetch();
  }

  attachDevtoolsBridge() {
    if (typeof window === 'undefined') {
      return;
    }

    window.__BRACKETS_DEVTOOLS__ = {
      inspect: () => this.createDebugSnapshot(),
      invalidate: (key) => this.invalidateCache(key),
      refreshSession: (force = true) => this.getSession(force)
    };
    this.emitDebugEvent('devtools-ready', this.createDebugSnapshot());
  }

  createDebugSnapshot() {
    return {
      route: this.current
        ? {
            id: this.current.route.id,
            path: this.current.location?.path ?? null,
            loading: this.routeState.loading,
            error: this.routeState.error ? String(this.routeState.error.message ?? this.routeState.error) : null
          }
        : null,
      session: {
        authenticated: Boolean(this.sessionState?.authenticated),
        user: this.sessionState?.user ?? null
      },
      cacheKeys: Array.from(this.resourceCache.keys()),
      activeRequests: Array.from(this.activeRequests.keys()),
      serviceWorker: {
        available: Boolean(this.host?.serviceWorker?.available),
        endpoint: this.host?.serviceWorker?.endpoint ?? null,
        registered: Boolean(this.serviceWorkerRegistration)
      },
      routes: this.routes.map((route) => ({
        id: route.id,
        route: route.route,
        title: route.title ?? '',
        preload: route.preload ?? null,
        aliasOf: route.aliasOf ?? null,
        aliases: normalizeRouteAliases(route)
      }))
    };
  }

  emitDebugEvent(type, detail = null) {
    if (typeof window === 'undefined') {
      return;
    }

    const snapshot = this.createDebugSnapshot();
    window.dispatchEvent(new CustomEvent('brackets:debug', {
      detail: {
        type,
        detail,
        snapshot
      }
    }));
  }

  async registerServiceWorker() {
    if (typeof window === 'undefined' || !canRegisterServiceWorker(this.host, window.location, navigator)) {
      return null;
    }

    try {
      this.serviceWorkerRegistration = await navigator.serviceWorker.register(
        this.host.serviceWorker.endpoint,
        { scope: this.host.serviceWorker.scope ?? '/' }
      );
      this.emitDebugEvent('service-worker-registered', {
        scope: this.serviceWorkerRegistration.scope
      });
      return this.serviceWorkerRegistration;
    } catch (error) {
      this.emitDebugEvent('service-worker-error', {
        message: String(error?.message ?? error)
      });
      return null;
    }
  }

  matchRoute(pathname) {
    for (const route of this.routes) {
      const match = pathname.match(route._matcher ?? buildRouteMatcher(route.route).regex);
      if (match) {
        const params = route.routeKeys?.length
          ? extractRouteParams(route.routeKeys, match)
          : parseRoute(route.route, pathname);
        if (!validateRouteParams(route, params ?? {})) {
          continue;
        }
        return { route, params: params ?? {} };
      }
    }

    return null;
  }

  extractFills(pageHtml) {
    const fills = [];
    const regex = /<template[^>]*data-brx-fill="([^"]+)"[^>]*>([\s\S]*?)<\/template>/g;
    let match;
    while ((match = regex.exec(pageHtml))) {
      fills.push({
        area: match[1].replace(/^['"]|['"]$/g, ''),
        html: match[2]
      });
    }
    return fills;
  }

  stripFills(pageHtml) {
    return pageHtml.replace(/<template[^>]*data-brx-fill="([^"]+)"[^>]*>[\s\S]*?<\/template>/g, '');
  }

  captureLayoutAreas() {
    const areas = {};
    if (!root) {
      return areas;
    }

    for (const element of root.querySelectorAll('[data-brx-area]')) {
      const name = element.getAttribute('data-brx-area')?.replace(/^['"]|['"]$/g, '');
      if (!name) {
        continue;
      }
      areas[name] = element.innerHTML;
    }

    return areas;
  }

  restoreLayoutAreas() {
    if (!root || !this.layout?.areas) {
      return;
    }

    for (const [name, html] of Object.entries(this.layout.areas)) {
      const target = root.querySelector(`[data-brx-area="${name}"]`);
      if (target) {
        target.innerHTML = html;
      }
    }
  }

  applyFills(fills) {
    if (!root) {
      return;
    }

    for (const fill of fills) {
      const target = root.querySelector(`[data-brx-area="${fill.area}"]`);
      if (target) {
        target.innerHTML = fill.html;
      }
    }
  }

  readPath(source, expression) {
    return expression.split('.').reduce((current, key) => current?.[key], source);
  }

  writePath(source, expression, value) {
    const keys = expression.split('.');
    let pointer = source;
    while (keys.length > 1) {
      const key = keys.shift();
      pointer[key] ??= {};
      pointer = pointer[key];
    }
    pointer[keys[0]] = value;
  }

  buildExpressionScope(instance, overrides = {}) {
    const actionScope = Object.fromEntries(
      Object.entries(instance.logic ?? {})
        .filter(([, value]) => typeof value === 'function')
        .map(([name]) => [
          name,
          (...args) => this.callAction(name, args, this.actionContext?.event ?? null, this.actionContext?.element ?? null)
        ])
    );

    return {
      ...snapshotSignals(),
      request: this.request,
      get: this.get,
      create: this.create,
      update: this.update,
      patch: this.patch,
      delete: this.delete,
      read: this.read,
      mutate: this.mutate.bind(this),
      patchDomFromHtml,
      route: this.buildRouteContext(instance.route, instance.params, instance.location),
      props: instance.props ?? {},
      event: this.actionContext?.event ?? null,
      nav: this.nav,
      loading: (name) => this.createCtx(instance).loading(name),
      error: (name) => this.createCtx(instance).error(name),
      self: instance.root,
      root: instance.root,
      Math,
      Number,
      String,
      Boolean,
      Array,
      Object,
      JSON,
      ...actionScope,
      ...overrides
    };
  }

  evaluate(instance, expression, overrides = {}) {
    return evaluateFrameworkExpression(expression, this.buildExpressionScope(instance, overrides));
  }

  async execute(instance, expression, overrides = {}) {
    return this.evaluate(instance, expression, overrides);
  }

  renderEach(instance, binding, scope) {
    const template = binding.element;
    const source = template.__brxTemplate ?? template.innerHTML;
    template.__brxTemplate = source;
    const [itemName, listExpression] = binding.expression.split(/\s+in\s+/);
    const collection = this.evaluate(instance, listExpression) ?? [];
    template.innerHTML = collection.map((item, index) => {
      return source.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, lookup) => {
        const value = evaluateFrameworkExpression(lookup.trim(), {
          ...scope,
          [itemName.trim()]: item,
          $index: index
        });
        return value ?? '';
      });
    }).join('');
  }

  bindTree(instance) {
    const elements = [instance.root, ...instance.root.querySelectorAll('*')];
    for (const element of elements) {
      for (const attribute of [...element.attributes]) {
        if (attribute.name.startsWith('data-brx-on:')) {
          const eventName = attribute.name.split(':')[1];
          element.addEventListener(eventName, async (event) => {
            this.actionContext = { event, element };
            await this.runAction(instance, attribute.value, event, element);
            this.actionContext = null;
          });
        }
      }

      for (const [kind, attributeName] of [
        ['html', 'data-brx-html'],
        ['if', 'data-brx-if'],
        ['each', 'data-brx-each'],
        ['loading', 'data-brx-loading'],
        ['error', 'data-brx-error']
      ]) {
        if (!element.hasAttribute(attributeName)) {
          continue;
        }

        instance.bindings.push({
          kind,
          element,
          expression: element.getAttribute(attributeName)
        });
      }
    }
  }

  renderBindings(instance) {
    const scope = snapshotSignals();

    for (const binding of instance.bindings) {
      if (binding.kind === 'html') {
        binding.element.innerHTML = this.renderHtmlContent(this.evaluate(instance, binding.expression) ?? '');
        continue;
      }

      if (binding.kind === 'if') {
        binding.element.hidden = !this.evaluate(instance, binding.expression);
        continue;
      }

      if (binding.kind === 'each') {
        this.renderEach(instance, binding, scope);
        continue;
      }

      if (binding.kind === 'loading') {
        const requestKey = this.getBindingRequestKey(instance, binding.expression);
        const loading = requestKey
          ? requestKey === 'route'
            ? this.routeState.loading
            : instance.requestState?.[requestKey]?.loading ?? false
          : instance.transportState.loading;
        binding.element.hidden = !loading;
        continue;
      }

      if (binding.kind === 'error') {
        const requestKey = this.getBindingRequestKey(instance, binding.expression);
        const requestError = requestKey
          ? requestKey === 'route'
            ? this.routeState.error
            : instance.requestState?.[requestKey]?.error ?? null
          : instance.transportState.error;
        binding.element.hidden = !requestError;
        if (requestError) {
          binding.element.dataset.brxError = String(requestError.message ?? requestError);
        } else {
          delete binding.element.dataset.brxError;
        }
      }
    }
  }

  renderHtmlContent(value) {
    const html = String(value ?? '');
    return this.security?.html === 'trusted'
      ? html
      : sanitizeHtmlFragment(html);
  }

  mutate(target, path, value) {
    if (typeof target === 'string') {
      this.writePath(datastarApi.root, target, path);
    } else if (target && typeof target === 'object' && typeof path === 'string') {
      this.writePath(target, path, value);
    } else if (target && typeof target === 'object') {
      this.patchSignals(target);
    } else {
      return snapshotSignals();
    }

    return snapshotSignals();
  }

  async performTransport(method, resultMode, url, payload, options = {}) {
    const instance = this.current;
    if (!instance) {
      throw new Error('No active route instance');
    }

    const requestKey = this.inferTransportKey(url, options);
    let request = null;
    const transportRequestId = this.beginTransportState(instance);
    let transportFinished = false;
    const completeTransport = (error = null) => {
      if (transportFinished) {
        return;
      }
      transportFinished = true;
      this.finishTransportState(instance, transportRequestId, error);
    };
    let requestFinished = false;
    const completeRequest = (error = null) => {
      if (requestFinished) {
        return;
      }
      requestFinished = true;
      this.finishRequest(instance, requestKey, error);
    };
    this.beginRequest(instance, requestKey);
    this.scheduleFrameworkRender(instance);

    if (resultMode === 'sse') {
      if (typeof EventSource !== 'function') {
        const error = new Error('EventSource is not available in this environment.');
        error.code = 'BRACKETS_SSE_UNAVAILABLE';
        completeTransport(error);
        completeRequest(error);
        this.scheduleFrameworkRender(instance);
        throw error;
      }

      const source = new EventSource(this.createEventStreamUrl(url, payload, options));
      source.addEventListener('open', () => {
        completeTransport(null);
        completeRequest(null);
        this.scheduleFrameworkRender(instance);
      });
      source.addEventListener('datastar-patch-signals', (event) => {
        try {
          this.patchSignals(JSON.parse(event.data));
        } catch {
          // ignore invalid patches
        }
      });
      source.addEventListener('datastar-patch-elements', (event) => {
        patchDomFromHtml(event.data);
      });
      source.addEventListener('error', (event) => {
        const error = this.createSseTransportError(event);
        completeTransport(error);
        completeRequest(error);
        this.scheduleFrameworkRender(instance);
      });
      return source;
    }

    try {
      request = this.createFetchRequest(method, resultMode, url, payload, options);
      const response = await fetch(request.url, {
        method,
        headers: request.headers,
        body: request.body,
        signal: request.controller?.signal
      });

      const { contentType, payload: responsePayload } = await this.readTransportResponse(response, resultMode);
      if (!response.ok) {
        throw this.createTransportError(response, responsePayload);
      }

      if (resultMode === 'html' || contentType.includes('text/html')) {
        const html = String(responsePayload ?? '');
        patchDomFromHtml(
          html,
          response.headers.get('datastar-selector'),
          response.headers.get('datastar-mode') ?? 'outer'
        );
        return html;
      }

      const nextValue = responsePayload;
      if (resultMode === 'state' && nextValue && typeof nextValue === 'object') {
        this.patchSignals(nextValue);
      }
      return nextValue;
    } catch (error) {
      if (error?.name === 'AbortError') {
        completeTransport(null);
        completeRequest(null);
        return undefined;
      }
      completeTransport(error);
      completeRequest(error);
      throw error;
    } finally {
      if (!transportFinished) {
        completeTransport(instance.transportState.error ?? null);
      }
      if (!requestFinished) {
        completeRequest(instance.transportState.error ?? null);
      }
      if (requestKey && request?.controller && this.activeRequests.get(requestKey) === request.controller) {
        this.activeRequests.delete(requestKey);
      }
      this.scheduleFrameworkRender(instance);
    }
  }

  async callAction(name, args = [], event = null, element = null) {
    const instance = this.current;
    if (!instance || typeof instance.logic?.[name] !== 'function') {
      return undefined;
    }

    this.actionContext = { event, element };
    try {
      const ctx = this.createCtx(instance);
      const result = await instance.logic[name](...args, ctx);
      this.scheduleFrameworkRender(instance);
      return result;
    } finally {
      this.actionContext = null;
    }
  }

  async runAction(instance, expression, event, element) {
    const ctx = this.createCtx(instance);
    const trimmed = expression.trim();
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed) && typeof instance.logic?.[trimmed] === 'function') {
      await instance.logic[trimmed](ctx);
      this.scheduleFrameworkRender(instance);
      return;
    }

    await this.execute(instance, trimmed, { evt: event, el: element });
    this.scheduleFrameworkRender(instance);
  }

  async resolveUses(rootNode) {
    const uses = [...rootNode.querySelectorAll('[data-brx-use]')];
    for (const element of uses) {
      const specifier = element.getAttribute('data-brx-use')?.replace(/^['"]|['"]$/g, '');
      if (!specifier) {
        continue;
      }

      const componentUrl = specifier.startsWith('/app/')
        ? specifier
        : `/app/components/${specifier.endsWith('.html') ? specifier : `${specifier}.html`}`;
      if (!this.componentCache.has(componentUrl)) {
        this.componentCache.set(componentUrl, this.fetchTextCached(componentUrl));
      }
      const html = await this.componentCache.get(componentUrl);
      const propsExpression = element.getAttribute('data-brx-props');
      const props = propsExpression && this.current
        ? this.evaluate(this.current, propsExpression)
        : null;
      if (props && typeof props === 'object' && !Array.isArray(props)) {
        const existingSignals = element.getAttribute('data-signals');
        const mergedSignals = existingSignals
          ? { ...JSON.parse(existingSignals), ...props }
          : props;
        element.setAttribute('data-signals', JSON.stringify(mergedSignals));
        element.__brxProps = props;
      }
      element.innerHTML = html;
      if (props && typeof props === 'object') {
        element.innerHTML = element.innerHTML.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, lookup) => {
          const value = evaluateFrameworkExpression(lookup.trim(), {
            ...snapshotSignals(),
            props,
            ...props
          });
          return value ?? '';
        });
      }
      await this.resolveUses(element);
    }
  }

  async disposeCurrent(options = {}) {
    if (!this.current) {
      return;
    }

    for (const cleanup of this.current.cleanups.reverse()) {
      await cleanup();
    }

    if (!options.preserveLayout) {
      this.layout = null;
    }

    this.current = null;
  }

  updateHistory(nextLocation, options) {
    if (options.historyChange === false) {
      return;
    }

    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentPath === nextLocation.path) {
      return;
    }

    const fn = options.replace ? history.replaceState : history.pushState;
    fn.call(history, {}, '', nextLocation.path);
  }

  applyDocumentTitle(route) {
    if (typeof document === 'undefined') {
      return;
    }

    document.title = route?.title || 'Brackets';
  }

  setHeadTag(selector, tagName, attributes = {}, content = null) {
    if (typeof document === 'undefined') {
      return;
    }

    let element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement(tagName);
      element.setAttribute('data-brackets-head', 'true');
      document.head.append(element);
    }

    for (const [name, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== null && value !== '') {
        element.setAttribute(name, String(value));
      }
    }

    if (content !== null) {
      element.textContent = String(content);
    }
  }

  applyDocumentMetadata(route) {
    if (typeof document === 'undefined') {
      return;
    }

    this.applyDocumentTitle(route);
    const meta = route?.meta ?? {};
    const seo = route?.seo ?? {};
    const description = meta.description ?? seo.description ?? '';
    const canonical = seo.canonical ?? route?.route ?? '/';
    const ogImage = seo.image ?? meta.image ?? '';
    const lang = meta.lang ?? 'en';
    const dir = meta.dir ?? '';

    document.documentElement.lang = lang;
    if (dir) {
      document.documentElement.dir = dir;
    } else {
      document.documentElement.removeAttribute('dir');
    }
    this.setHeadTag('meta[name="description"]', 'meta', { name: 'description', content: description });
    if (route?.assets?.themeColor) {
      this.setHeadTag('meta[name="theme-color"]', 'meta', { name: 'theme-color', content: route.assets.themeColor });
    }
    this.setHeadTag('link[rel="canonical"]', 'link', { rel: 'canonical', href: canonical ? new URL(canonical, window.location.origin).href : '' });
    this.setHeadTag('meta[property="og:title"]', 'meta', { property: 'og:title', content: route?.title ?? 'Brackets' });
    this.setHeadTag('meta[property="og:description"]', 'meta', { property: 'og:description', content: description });
    if (ogImage) {
      this.setHeadTag('meta[property="og:image"]', 'meta', { property: 'og:image', content: new URL(ogImage, window.location.origin).href });
    }
    for (const alternate of seo.alternates ?? []) {
      const hrefLang = alternate.hrefLang ?? alternate.lang;
      if (!hrefLang || !alternate.href) {
        continue;
      }
      this.setHeadTag(`link[rel="alternate"][hreflang="${hrefLang}"]`, 'link', {
        rel: 'alternate',
        hreflang: hrefLang,
        href: new URL(alternate.href, window.location.origin).href
      });
    }
    if (seo.structuredData) {
      this.setHeadTag('script[data-brackets-structured-data]', 'script', {
        type: 'application/ld+json',
        'data-brackets-structured-data': 'true'
      }, JSON.stringify(seo.structuredData));
    }
  }

  scrollAfterNavigation(nextLocation, options) {
    if (typeof window === 'undefined' || options.historyChange === false) {
      return;
    }

    if (nextLocation.hash) {
      const target = document.getElementById(nextLocation.hash.slice(1))
        ?? document.querySelector(nextLocation.hash);
      if (target?.scrollIntoView) {
        target.scrollIntoView();
        return;
      }
    }

    window.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
  }

  async renderNotFound(nextLocation, options = {}) {
    if (!root) {
      return;
    }

    await this.disposeCurrent();
    root.innerHTML = `<main style="padding: 3rem;"><h1>Route not found</h1><p>${safeText(nextLocation.pathname)}</p></main>`;
    this.lastRouteSnapshot = {
      route: null,
      params: {},
      location: nextLocation
    };
    this.applyDocumentMetadata({ title: 'Not Found', meta: { description: 'Route not found' }, seo: { index: false } });
    this.emitDebugEvent('route-not-found', {
      path: nextLocation.path
    });
    this.scrollAfterNavigation(nextLocation, options);
  }

  async navigate(nextPath, options = {}) {
    if (!root) {
      return;
    }

    const navigationToken = ++this.navigationToken;
    const nextLocation = createLocationSnapshot(nextPath, window.location.origin);
    try {
      this.routeState.loading = true;
      this.routeState.error = null;
      this.scheduleFrameworkRender(this.current);
      const matched = this.matchRoute(nextLocation.pathname);
      const beforeDecision = normalizeRouterRedirect(await this.runRouterHook('beforeEach', nextLocation, matched));

      if (beforeDecision && beforeDecision.path !== nextLocation.path) {
        this.routeState.loading = false;
        await this.navigate(beforeDecision.path, {
          replace: beforeDecision.replace,
          _redirectChain: extendNavigationRedirectChain(options._redirectChain ?? [nextLocation.path], beforeDecision.path, window.location.origin)
        });
        return;
      }

      if (!matched) {
        const notFoundResult = await this.runRouterHook('notFound', nextLocation, null);
        const notFoundOutcome = resolveNotFoundResult(notFoundResult, nextLocation.path, window.location.origin);
        if (notFoundOutcome.kind === 'redirect') {
          this.routeState.loading = false;
          await this.navigate(notFoundOutcome.redirect.path, {
            replace: notFoundOutcome.redirect.replace,
            _redirectChain: extendNavigationRedirectChain(options._redirectChain ?? [nextLocation.path], notFoundOutcome.redirect.path, window.location.origin)
          });
          return;
        }

        if (notFoundOutcome.updateHistory) {
          this.updateHistory(nextLocation, options);
        }

        if (notFoundOutcome.kind === 'html') {
          await this.disposeCurrent();
          root.innerHTML = this.renderHtmlContent(notFoundOutcome.result.html);
          this.lastRouteSnapshot = {
            route: null,
            params: {},
            location: nextLocation
          };
          this.applyDocumentMetadata({
            title: notFoundOutcome.result.title ?? 'Not Found',
            meta: { description: notFoundOutcome.result.description ?? 'Route not found' },
            seo: { index: false }
          });
          this.emitDebugEvent('route-not-found', {
            path: nextLocation.path,
            custom: true
          });
          this.routeState.loading = false;
          this.scheduleFrameworkRender(this.current);
          this.scrollAfterNavigation(nextLocation, options);
          return;
        }

        await this.renderNotFound(nextLocation, options);
        this.routeState.loading = false;
        this.scheduleFrameworkRender(this.current);
        return;
      }

      const route = matched.route;
      if (route.redirectTo) {
        this.routeState.loading = false;
        await this.nav.redirect(route.redirectTo, {
          replace: true,
          _redirectChain: extendNavigationRedirectChain(options._redirectChain ?? [nextLocation.path], route.redirectTo, window.location.origin)
        });
        return;
      }

      if (route.auth?.required) {
        const session = await this.resolveRouteSession(route);
        if (!session) {
          this.routeState.loading = false;
          const redirectPath = route.auth.redirectTo ?? '/login';
          await this.nav.redirect(redirectPath, {
            replace: true,
            _redirectChain: extendNavigationRedirectChain(options._redirectChain ?? [nextLocation.path], redirectPath, window.location.origin)
          });
          return;
        }
      }
      this.updateHistory(nextLocation, options);
      const plan = buildNavigationPlan(this.current, this.layout, route);

      if (plan.shouldSync && this.current) {
        this.current.route = route;
        this.current.params = matched.params;
        this.current.location = nextLocation;
        this.lastRouteSnapshot = {
          route,
          params: clone(matched.params),
          location: nextLocation
        };
        this.applyDocumentMetadata(route);

        if (typeof this.current.logic?.sync === 'function') {
          await this.current.logic.sync(this.createCtx(this.current));
        }

        if (navigationToken !== this.navigationToken) {
          return;
        }

        await this.runRouterHook('afterEach', nextLocation, matched);
        this.scheduleFrameworkRender(this.current);
        this.routeState.loading = false;
        this.scheduleConfiguredPrefetch();
        this.emitDebugEvent('route-sync', {
          id: route.id,
          path: nextLocation.path
        });
        this.scrollAfterNavigation(nextLocation, options);
        return;
      }

      void this.warmRoute(route);

      const pageHtmlPromise = this.fetchTextCached(route.htmlUrl);
      const logicPromise = route.logicUrl
        ? this.importModuleCached(route.logicUrl)
        : Promise.resolve({});

      if (plan.layoutChanged) {
        const layoutHtml = route.layoutUrl
          ? await this.fetchTextCached(route.layoutUrl)
          : '<main data-brx-mount></main>';

        if (navigationToken !== this.navigationToken) {
          return;
        }

        if (this.current) {
          await this.disposeCurrent();
        }

        if (navigationToken !== this.navigationToken) {
          return;
        }

        root.innerHTML = layoutHtml;
        this.layout = {
          url: route.layoutUrl ?? null,
          areas: this.captureLayoutAreas()
        };
      } else if (this.current) {
        await this.disposeCurrent({ preserveLayout: true });

        if (navigationToken !== this.navigationToken) {
          return;
        }

        this.restoreLayoutAreas();
      }

      const [pageHtml, logic] = await Promise.all([pageHtmlPromise, logicPromise]);
      if (navigationToken !== this.navigationToken) {
        return;
      }

      if (!plan.layoutChanged) {
        this.restoreLayoutAreas();
      }

      const mountPoint = root.querySelector('[data-brx-mount]') ?? root;
      const fills = this.extractFills(pageHtml);
      this.applyFills(fills);
      mountPoint.innerHTML = this.stripFills(pageHtml);

      const pageRoot = mountPoint.firstElementChild ?? mountPoint;
      const instance = {
        route,
        params: matched.params,
        location: nextLocation,
        root: pageRoot,
        logic,
        bindings: [],
        cleanups: [],
        transportState: {
          loading: false,
          error: null,
          pending: 0,
          latestRequestId: 0
        },
        requestState: {}
      };

      pageRoot.dataset.brxRoute = route.id;
      this.current = instance;
      this.lastRouteSnapshot = {
        route,
        params: clone(matched.params),
        location: nextLocation
      };
      this.applyDocumentMetadata(route);

      await this.resolveUses(instance.root);
      await this.flushDatastar();

      if (navigationToken !== this.navigationToken) {
        return;
      }

      this.bindTree(instance);
      this.renderBindings(instance);

      if (typeof logic.mount === 'function') {
        const maybeCleanup = await logic.mount(this.createCtx(instance));
        if (typeof maybeCleanup === 'function') {
          instance.cleanups.push(maybeCleanup);
        }
      }

      if (navigationToken !== this.navigationToken) {
        return;
      }

      await this.runRouterHook('afterEach', nextLocation, matched);
      this.routeState.loading = false;
      this.scheduleConfiguredPrefetch();
      this.emitDebugEvent('route-mounted', {
        id: route.id,
        path: nextLocation.path
      });
      this.scrollAfterNavigation(nextLocation, options);
    } catch (error) {
      this.routeState.error = error;
      this.routeState.loading = false;
      this.scheduleFrameworkRender(this.current);
      this.emitDebugEvent('route-error', {
        path: nextLocation.path,
        error: String(error?.message ?? error)
      });
    }
  }
}

async function bootstrap() {
  if (typeof window === 'undefined' || !root) {
    return;
  }

  await ensureDatastarApi();

  const config = await fetch('/config/brackets.json').then((response) => response.json());
  const app = new BracketsApp(config);
  window.BracketsRuntime = app;
  await app.start();
  await app.navigate(window.location.pathname + window.location.search + window.location.hash, {
    replace: true,
    historyChange: false
  });
}

void bootstrap();
