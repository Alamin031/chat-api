export interface EnvironmentVariables {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  DATABASE_SSL: boolean;
  DATABASE_POOL_MAX: number;
  REDIS_URL?: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  SESSION_TTL_SECONDS: number;
  CORS_ORIGIN: string;
}

const VALID_NODE_ENVS = new Set<EnvironmentVariables['NODE_ENV']>([
  'development',
  'test',
  'production',
]);

function readString(
  config: Record<string, unknown>,
  key: string,
  fallback?: string,
): string {
  const value = config[key];

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Environment variable ${key} is required.`);
}

function readNumber(
  config: Record<string, unknown>,
  key: string,
  fallback?: number,
): number {
  const value = config[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Environment variable ${key} must be a valid number.`);
}

function readBoolean(
  config: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = config[key];

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return fallback;
}

function readOptionalString(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = config[key];

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const nodeEnv = readString(config, 'NODE_ENV', 'development');

  if (!VALID_NODE_ENVS.has(nodeEnv as EnvironmentVariables['NODE_ENV'])) {
    throw new Error(
      'Environment variable NODE_ENV must be development, test, or production.',
    );
  }

  const typedNodeEnv = nodeEnv as EnvironmentVariables['NODE_ENV'];
  const databaseUrlFallback =
    typedNodeEnv === 'test'
      ? 'postgresql://postgres:postgres@127.0.0.1:5432/chat_api_test'
      : undefined;

  return {
    NODE_ENV: typedNodeEnv,
    PORT: readNumber(config, 'PORT', 3000),
    DATABASE_URL: readString(config, 'DATABASE_URL', databaseUrlFallback),
    DATABASE_SSL: readBoolean(
      config,
      'DATABASE_SSL',
      typedNodeEnv === 'production',
    ),
    DATABASE_POOL_MAX: readNumber(config, 'DATABASE_POOL_MAX', 10),
    REDIS_URL: readOptionalString(config, 'REDIS_URL'),
    REDIS_HOST: readString(config, 'REDIS_HOST', '127.0.0.1'),
    REDIS_PORT: readNumber(config, 'REDIS_PORT', 6379),
    REDIS_PASSWORD: readString(config, 'REDIS_PASSWORD', ''),
    SESSION_TTL_SECONDS: readNumber(config, 'SESSION_TTL_SECONDS', 86400),
    CORS_ORIGIN: readString(config, 'CORS_ORIGIN', '*'),
  };
}
