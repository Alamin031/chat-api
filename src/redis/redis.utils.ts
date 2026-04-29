import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

export function attachRedisErrorHandler(
  client: Redis,
  connectionName: string,
): void {
  const logger = new Logger(`Redis:${connectionName}`);
  let lastErrorSignature = '';
  let lastLoggedAt = 0;

  client.on('error', (error: Error) => {
    const signature = `${error.name}:${error.message}`;
    const now = Date.now();

    if (signature !== lastErrorSignature || now - lastLoggedAt >= 10000) {
      logger.error(error.message);
      lastErrorSignature = signature;
      lastLoggedAt = now;
    }
  });
}
