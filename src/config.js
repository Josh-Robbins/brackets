import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parseYaml } from './data-adapters.js';

const FRAMEWORK_DEMO_DIR = path.resolve('src/framework/demo');
const FRAMEWORK_TEMPLATE_CACHE = new Map();

export const DEFAULT_BRACKETS_CONFIG = Object.freeze({
  server: {
    host: '127.0.0.1',
    port: 4173
  },
  branding: {
    name: 'Brackets',
    title: 'Brackets is ready',
    tagline: 'Everything is working and ready to start building.',
    accent: '#c4512c',
    accentSoft: '#f6b48f',
    canvas: '#f7efe3',
    panel: '#fffaf4',
    ink: '#1f1a17',
    muted: '#6c6257'
  },
  splash: {
    enabled: true,
    chips: ['No build step', 'Datastar engine', 'Backend agnostic'],
    hints: [
      'Edit files in app/',
      'Adjust settings in config/brackets.json or config/brackets.yaml',
      'Use framework/docs.md and framework/agents.md when you need help'
    ]
  }
});

function deepMerge(base, patch) {
  const output = Array.isArray(base) ? [...base] : { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = deepMerge(output[key] ?? {}, value);
      continue;
    }
    output[key] = value;
  }
  return output;
}

function configRootFromApp(appRoot) {
  const resolved = path.resolve(appRoot);
  if (path.basename(resolved).toLowerCase() === 'app') {
    return path.dirname(resolved);
  }
  return resolved;
}

function configCandidates(appRoot) {
  const rootDir = configRootFromApp(appRoot);
  return [
    path.join(rootDir, 'config', 'brackets.yaml'),
    path.join(rootDir, 'config', 'brackets.yml'),
    path.join(rootDir, 'config', 'brackets.json'),
    path.join(path.resolve(appRoot), 'config', 'brackets.yaml'),
    path.join(path.resolve(appRoot), 'config', 'brackets.yml'),
    path.join(path.resolve(appRoot), 'config', 'brackets.json')
  ];
}

async function readConfigFile(filePath) {
  const source = await readFile(filePath, 'utf8');
  if (filePath.endsWith('.json')) {
    return JSON.parse(source);
  }
  return parseYaml(source);
}

function normalizeConfig(config, appRoot) {
  const merged = deepMerge(DEFAULT_BRACKETS_CONFIG, config ?? {});
  merged.branding.name ||= path.basename(configRootFromApp(appRoot));
  merged.branding.title ||= `${merged.branding.name} is ready`;
  merged.branding.tagline ||= 'Everything is working and ready to start building.';
  merged.server.host ||= DEFAULT_BRACKETS_CONFIG.server.host;
  merged.server.port ||= DEFAULT_BRACKETS_CONFIG.server.port;
  merged.splash.enabled = merged.splash.enabled !== false;
  merged.splash.chips ||= [...DEFAULT_BRACKETS_CONFIG.splash.chips];
  merged.splash.hints ||= [...DEFAULT_BRACKETS_CONFIG.splash.hints];
  return merged;
}

export async function loadBracketsConfig(appRoot) {
  for (const filePath of configCandidates(appRoot)) {
    if (!existsSync(filePath)) {
      continue;
    }

    const config = normalizeConfig(await readConfigFile(filePath), appRoot);
    return {
      filePath,
      config
    };
  }

  return {
    filePath: null,
    config: normalizeConfig({}, appRoot)
  };
}

function logoPalette(config) {
  return {
    accent: config.branding?.accent ?? DEFAULT_BRACKETS_CONFIG.branding.accent,
    accentSoft: config.branding?.accentSoft ?? DEFAULT_BRACKETS_CONFIG.branding.accentSoft,
    canvas: config.branding?.canvas ?? DEFAULT_BRACKETS_CONFIG.branding.canvas,
    panel: config.branding?.panel ?? DEFAULT_BRACKETS_CONFIG.branding.panel,
    ink: config.branding?.ink ?? DEFAULT_BRACKETS_CONFIG.branding.ink,
    muted: config.branding?.muted ?? DEFAULT_BRACKETS_CONFIG.branding.muted
  };
}

function safeTemplateText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readFrameworkDemoTemplate(fileName) {
  const cached = FRAMEWORK_TEMPLATE_CACHE.get(fileName);
  if (cached) {
    return cached;
  }

  const source = readFileSync(path.join(FRAMEWORK_DEMO_DIR, fileName), 'utf8');
  FRAMEWORK_TEMPLATE_CACHE.set(fileName, source);
  return source;
}

function fillTemplate(source, replacements) {
  return source.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => replacements[key] ?? '');
}

export function buildFrameworkLogoSvg(config) {
  const palette = logoPalette(config);
  const name = config.branding?.name ?? 'Brackets';
  const title = config.branding?.title ?? `${name} is ready`;
  const tagline = config.branding?.tagline ?? '';
  return fillTemplate(readFrameworkDemoTemplate('logo.svg'), {
    TITLE: safeTemplateText(title),
    TAGLINE: safeTemplateText(tagline),
    NAME: safeTemplateText(name),
    ACCENT: safeTemplateText(palette.accent),
    ACCENT_SOFT: safeTemplateText(palette.accentSoft),
    PANEL: safeTemplateText(palette.panel),
    INK: safeTemplateText(palette.ink),
    MUTED: safeTemplateText(palette.muted)
  });
}

export function buildFrameworkFaviconSvg(config) {
  const palette = logoPalette(config);
  return fillTemplate(readFrameworkDemoTemplate('favicon.svg'), {
    PANEL: safeTemplateText(palette.panel),
    ACCENT: safeTemplateText(palette.accent),
    INK: safeTemplateText(palette.ink)
  });
}
