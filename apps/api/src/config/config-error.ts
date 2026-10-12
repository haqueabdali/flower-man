/** Invalid or missing configuration. Messages must never contain secret values. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}
