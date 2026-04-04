export const BRACKETS_VERSION = '0.95.0';
export const DATASTAR_VERSION = '1.0.0-RC.8';
export const EMBEDDED_ENGINE = 'deno';
export const EMBEDDED_ENGINE_VERSION = '2.7.9';

export function buildVersionSnapshot() {
  return {
    framework: 'Brackets',
    version: BRACKETS_VERSION,
    datastar: {
      bundled: true,
      version: DATASTAR_VERSION
    },
    engine: {
      name: EMBEDDED_ENGINE,
      bundled: true,
      version: EMBEDDED_ENGINE_VERSION
    }
  };
}
