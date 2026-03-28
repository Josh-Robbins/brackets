import { validatePageManifestContract } from './contracts.js';

export const PAGE_MANIFEST_FIELDS = [
  'id',
  'html',
  'logic',
  'route',
  'alias',
  'aliases',
  'params',
  'redirectTo',
  'preload',
  'title',
  'meta',
  'seo',
  'auth',
  'assets',
  'layout',
  'api',
  'data'
];

export const PAGE_MANIFEST_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://brackets.dev/schemas/page-manifest.json',
  title: 'Brackets Page Manifest',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'html'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      description: 'Stable page identity.'
    },
    html: {
      type: 'string',
      minLength: 1,
      description: 'Page HTML reference.'
    },
    logic: {
      type: 'string',
      description: 'Optional primary behavior module.'
    },
    route: {
      type: 'string',
      description: 'Optional route pattern or path.'
    },
    alias: {
      type: 'string',
      description: 'Optional alias route path.'
    },
    aliases: {
      type: 'array',
      description: 'Optional alias route paths.',
      items: {
        type: 'string'
      }
    },
    params: {
      type: 'object',
      description: 'Optional param validation rules keyed by param name.',
      additionalProperties: {
        type: 'string'
      }
    },
    redirectTo: {
      type: 'string',
      description: 'Optional redirect target for this route.'
    },
    preload: {
      type: 'string',
      description: 'Optional preload policy such as render or idle.'
    },
    title: {
      type: 'string',
      description: 'Optional document title.'
    },
    meta: {
      type: 'object',
      description: 'Metadata such as description, lang, and dir.',
      additionalProperties: true
    },
    seo: {
      type: 'object',
      description: 'SEO details such as canonical URL, alternates, and structured data.',
      additionalProperties: true
    },
    auth: {
      type: 'object',
      description: 'Route auth requirements such as required and redirectTo.',
      additionalProperties: true
    },
    assets: {
      type: 'object',
      description: 'Route asset metadata such as icons, themeColor, and display.',
      additionalProperties: true
    },
    layout: {
      type: 'string',
      description: 'Optional layout HTML reference.'
    },
    api: {
      type: 'object',
      description: 'Named remote/backend dependencies.',
      additionalProperties: {
        type: 'string'
      }
    },
    data: {
      type: 'object',
      description: 'Named local data dependencies.',
      additionalProperties: {
        type: 'string'
      }
    }
  }
};

export function validatePageManifest(definition, context = 'Brackets page()') {
  return validatePageManifestContract(definition, {
    context,
    allowedFields: PAGE_MANIFEST_FIELDS
  });
}

export function page(definition) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new Error('Brackets page() requires an object definition');
  }

  const unknown = Object.keys(definition).filter((key) => !PAGE_MANIFEST_FIELDS.includes(key));
  if (unknown.length) {
    throw new Error(`Brackets page() received unknown field(s): ${unknown.join(', ')}`);
  }

  if (typeof definition.id !== 'string' || !definition.id.trim()) {
    throw new Error('Brackets page() requires a non-empty string id');
  }

  if (typeof definition.html !== 'string' || !definition.html.trim()) {
    throw new Error(`Brackets page("${definition.id}") requires a non-empty html reference`);
  }

  return {
    ...validatePageManifest(definition)
  };
}
