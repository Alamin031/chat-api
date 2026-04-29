import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EnvironmentVariables } from '../config/env.validation';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';
import { RedisService } from './redis.service';
import { attachRedisErrorHandler } from './redis.utils';

async function createRedisClient(
  config: ConfigService<EnvironmentVariables, true>,
  connectionName: string,
): Promise<Redis> {
  const redisUrl = config.get('REDIS_URL', { infer: true });
  const host = config.get('REDIS_HOST', { infer: true });
  const port = config.get('REDIS_PORT', { infer: true });
  const password = config.get('REDIS_PASSWORD', { infer: true }) || undefined;
  const clientOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    connectionName,
    connectTimeout: 10000,
    keepAlive: 30000,
    noDelay: true,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
  };
  const client = redisUrl
    ? new Redis(redisUrl, clientOptions)
    : new Redis({
        host,
        port,
        password,
        ...clientOptions,
      });

  attachRedisErrorHandler(client, connectionName);

  if (config.get('NODE_ENV', { infer: true }) !== 'test') {
    try {
      await client.connect();
    } catch {
      client.disconnect();
      const connectionTarget = redisUrl ? 'REDIS_URL' : `${host}:${port}`;
      throw new Error(
        `Unable to connect to Redis for ${connectionName} using ${connectionTarget}. ` +
          'Start Redis or update REDIS_URL / REDIS_HOST / REDIS_PORT in your environment.',
      );
    }
  }

  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<EnvironmentVariables, true>) =>
        createRedisClient(config, 'chat-api-publisher'),
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<EnvironmentVariables, true>) =>
        createRedisClient(config, 'chat-api-subscriber'),
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER, RedisService],
})
export class RedisModule {}
