import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

const fileQueues = new Map();
const databaseCache = new Map();
const DEFAULT_STORAGE_KEY_ENV = 'BRACKETS_DATA_KEY';
const DEFAULT_PBKDF2_ITERATIONS = 250_000;
const ENCRYPTED_STORAGE_VERSION = 1;

function queueByKey(key, task) {
  const current = fileQueues.get(key) ?? Promise.resolve();
  const next = current.catch(() => {}).then(task);
  let queued;
  const settled = next.finally(() => {
    if (fileQueues.get(key) === queued) {
      fileQueues.delete(key);
    }
  });
  queued = settled.catch(() => {});
  fileQueues.set(key, queued);
  return next;
}

async function ensureParentDirectory(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function writeTextAtomically(filePath, content) {
  await ensureParentDirectory(filePath);
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  await writeFile(tempPath, content, 'utf8');
  await rename(tempPath, filePath);
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === '') return '';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseYamlBlock(lines, startIndex = 0, indent = 0) {
  let index = startIndex;
  let container = null;

  while (index < lines.length) {
    const rawLine = lines[index];
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) {
      index += 1;
      continue;
    }

    const currentIndent = rawLine.match(/^ */)[0].length;
    if (currentIndent < indent) {
      break;
    }

    const line = rawLine.trim();
    if (line.startsWith('- ')) {
      container ??= [];
      if (!Array.isArray(container)) {
        throw new Error('Mixed YAML object and array content is not supported');
      }

      const valuePart = line.slice(2);
      if (!valuePart) {
        const nested = parseYamlBlock(lines, index + 1, currentIndent + 2);
        container.push(nested.value);
        index = nested.index;
        continue;
      }

      if (valuePart.includes(': ') && !valuePart.startsWith('"') && !valuePart.startsWith('\'')) {
        const [key, ...rest] = valuePart.split(': ');
        const nestedObject = { [key]: parseScalar(rest.join(': ')) };
        const nested = parseYamlBlock(lines, index + 1, currentIndent + 2);
        if (nested.index > index + 1 && nested.value && typeof nested.value === 'object' && !Array.isArray(nested.value)) {
          Object.assign(nestedObject, nested.value);
          index = nested.index;
        } else {
          index += 1;
        }
        container.push(nestedObject);
        continue;
      }

      container.push(parseScalar(valuePart));
      index += 1;
      continue;
    }

    container ??= {};
    if (Array.isArray(container)) {
      throw new Error('Mixed YAML array and object content is not supported');
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      throw new Error(`Invalid YAML line: ${line}`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const remainder = line.slice(separatorIndex + 1).trim();

    if (!remainder) {
      const nested = parseYamlBlock(lines, index + 1, currentIndent + 2);
      container[key] = nested.value;
      index = nested.index;
      continue;
    }

    container[key] = parseScalar(remainder);
    index += 1;
  }

  return {
    value: container ?? {},
    index
  };
}

export function parseYaml(source) {
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');
  return parseYamlBlock(lines, 0, 0).value;
}

function yamlScalar(value) {
  if (typeof value === 'string') {
    return /[:#\-\n]/.test(value) ? JSON.stringify(value) : value;
  }
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

export function stringifyYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object') {
        const nested = stringifyYaml(item, indent + 2);
        return `${pad}-\n${nested}`;
      }
      return `${pad}- ${yamlScalar(item)}`;
    }).join('\n');
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => {
      if (item && typeof item === 'object') {
        return `${pad}${key}:\n${stringifyYaml(item, indent + 2)}`;
      }
      return `${pad}${key}: ${yamlScalar(item)}`;
    }).join('\n');
  }

  return `${pad}${yamlScalar(value)}`;
}

function getDatabase(filePath) {
  if (!databaseCache.has(filePath)) {
    const database = new DatabaseSync(filePath);
    databaseCache.set(filePath, database);
  }
  return databaseCache.get(filePath);
}

async function readStructuredFile(filePath, parser, fallbackValue = {}) {
  if (!existsSync(filePath)) {
    await ensureParentDirectory(filePath);
    return fallbackValue;
  }
  const raw = await readFile(filePath, 'utf8');
  return raw.trim() ? parser(raw) : fallbackValue;
}

function normalizeStorageSecurityOptions(security = {}) {
  const storage = security?.storage ?? {};
  return {
    keyEnv: storage.keyEnv || DEFAULT_STORAGE_KEY_ENV,
    pbkdf2Iterations: Number.isInteger(storage.pbkdf2Iterations) && storage.pbkdf2Iterations > 0
      ? storage.pbkdf2Iterations
      : DEFAULT_PBKDF2_ITERATIONS
  };
}

function resolveStoragePassphrase(runtimeOptions, defaults) {
  const keyEnv = runtimeOptions?.keyEnv || defaults.keyEnv;
  const passphrase = runtimeOptions?.passphrase ?? process.env[keyEnv];
  if (typeof passphrase === 'string' && passphrase.length > 0) {
    return { passphrase, keyEnv };
  }

  throw new Error(`Missing encrypted storage key. Set ${keyEnv} in the host environment or pass a secure passphrase explicitly.`);
}

function encryptText(content, runtimeOptions, defaults) {
  const { passphrase, keyEnv } = resolveStoragePassphrase(runtimeOptions, defaults);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(passphrase, salt, defaults.pbkdf2Iterations, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(content), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    v: ENCRYPTED_STORAGE_VERSION,
    alg: 'aes-256-gcm',
    kdf: 'pbkdf2-sha256',
    keyEnv,
    iterations: defaults.pbkdf2Iterations,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64')
  }, null, 2);
}

function decryptText(envelopeSource, runtimeOptions, defaults) {
  const envelope = JSON.parse(String(envelopeSource));
  if (envelope?.v !== ENCRYPTED_STORAGE_VERSION || envelope?.alg !== 'aes-256-gcm' || envelope?.kdf !== 'pbkdf2-sha256') {
    throw new Error('Encrypted storage payload is not in a supported Brackets format.');
  }

  const { passphrase } = resolveStoragePassphrase(runtimeOptions, {
    ...defaults,
    keyEnv: envelope.keyEnv || defaults.keyEnv
  });

  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.data, 'base64');
  const iterations = Number.isInteger(envelope.iterations) && envelope.iterations > 0
    ? envelope.iterations
    : defaults.pbkdf2Iterations;
  const key = pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

async function readEncryptedStructuredFile(filePath, parser, fallbackValue, runtimeOptions, defaults) {
  if (!existsSync(filePath)) {
    await ensureParentDirectory(filePath);
    return fallbackValue;
  }

  const raw = await readFile(filePath, 'utf8');
  if (!raw.trim()) {
    return fallbackValue;
  }

  const decrypted = decryptText(raw, runtimeOptions, defaults);
  return decrypted.trim() ? parser(decrypted) : fallbackValue;
}

export function createStorageHelpers(resolveSpecifier, options = {}) {
  const encryptionDefaults = normalizeStorageSecurityOptions(options.security);

  function secureStructured(specifier, parser, stringify, fallbackValue, runtimeOptions) {
    const filePath = resolveSpecifier(specifier);
    return {
      read(defaultValue = fallbackValue) {
        return queueByKey(filePath, () => readEncryptedStructuredFile(filePath, parser, defaultValue, runtimeOptions, encryptionDefaults));
      },
      async write(nextValue) {
        return queueByKey(filePath, async () => {
          const encrypted = encryptText(stringify(nextValue), runtimeOptions, encryptionDefaults);
          await writeTextAtomically(filePath, `${encrypted}\n`);
          return nextValue;
        });
      }
    };
  }

  return {
    json(specifier) {
      const filePath = resolveSpecifier(specifier);
      return {
        read(fallbackValue = []) {
          return queueByKey(filePath, () => readStructuredFile(filePath, JSON.parse, fallbackValue));
        },
        async write(nextValue) {
          return queueByKey(filePath, async () => {
            await writeTextAtomically(filePath, JSON.stringify(nextValue, null, 2));
            return nextValue;
          });
        }
      };
    },
    ejson(specifier, runtimeOptions = {}) {
      return secureStructured(
        specifier,
        JSON.parse,
        (value) => JSON.stringify(value, null, 2),
        [],
        runtimeOptions
      );
    },
    secureJson(specifier, runtimeOptions = {}) {
      return this.ejson(specifier, runtimeOptions);
    },
    '[e]json'(specifier, runtimeOptions = {}) {
      return this.ejson(specifier, runtimeOptions);
    },
    yaml(specifier) {
      const filePath = resolveSpecifier(specifier);
      return {
        read(fallbackValue = {}) {
          return queueByKey(filePath, () => readStructuredFile(filePath, parseYaml, fallbackValue));
        },
        async write(nextValue) {
          return queueByKey(filePath, async () => {
            await writeTextAtomically(filePath, `${stringifyYaml(nextValue)}\n`);
            return nextValue;
          });
        }
      };
    },
    eyaml(specifier, runtimeOptions = {}) {
      return secureStructured(
        specifier,
        parseYaml,
        (value) => `${stringifyYaml(value)}\n`,
        {},
        runtimeOptions
      );
    },
    secureYaml(specifier, runtimeOptions = {}) {
      return this.eyaml(specifier, runtimeOptions);
    },
    '[e]yaml'(specifier, runtimeOptions = {}) {
      return this.eyaml(specifier, runtimeOptions);
    },
    db(specifier) {
      const filePath = resolveSpecifier(specifier);
      return {
        async exec(sql) {
          await ensureParentDirectory(filePath);
          return queueByKey(filePath, () => {
            const db = getDatabase(filePath);
            db.exec(sql);
            return true;
          });
        },
        async run(sql, ...params) {
          await ensureParentDirectory(filePath);
          return queueByKey(filePath, () => {
            const db = getDatabase(filePath);
            return db.prepare(sql).run(...params);
          });
        },
        async get(sql, ...params) {
          await ensureParentDirectory(filePath);
          return queueByKey(filePath, () => {
            const db = getDatabase(filePath);
            return db.prepare(sql).get(...params);
          });
        },
        async all(sql, ...params) {
          await ensureParentDirectory(filePath);
          return queueByKey(filePath, () => {
            const db = getDatabase(filePath);
            return db.prepare(sql).all(...params);
          });
        },
        async transaction(callback) {
          await ensureParentDirectory(filePath);
          return queueByKey(filePath, async () => {
            const db = getDatabase(filePath);
            db.exec('BEGIN IMMEDIATE');
            try {
              const tx = {
                exec(sql) {
                  db.exec(sql);
                },
                run(sql, ...params) {
                  return db.prepare(sql).run(...params);
                },
                get(sql, ...params) {
                  return db.prepare(sql).get(...params);
                },
                all(sql, ...params) {
                  return db.prepare(sql).all(...params);
                }
              };
              const result = await callback(tx);
              db.exec('COMMIT');
              return result;
            } catch (error) {
              try {
                db.exec('ROLLBACK');
              } catch {
                // best effort rollback cleanup
              }
              throw error;
            }
          });
        }
      };
    }
  };
}

export function closeStorageAdapters() {
  for (const db of databaseCache.values()) {
    try {
      db.close();
    } catch {
      // best effort cleanup
    }
  }
  databaseCache.clear();
}
