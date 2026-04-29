process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '3001';
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@127.0.0.1:5432/chat_api_test';
process.env.DATABASE_SSL ??= 'false';
process.env.DATABASE_POOL_MAX ??= '5';
process.env.REDIS_HOST ??= '127.0.0.1';
process.env.REDIS_PORT ??= '6379';
process.env.SESSION_TTL_SECONDS ??= '86400';
process.env.CORS_ORIGIN ??= '*';
