import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

export function attachRedisErrorHandler(
  client: Redis,
  connectionName: string,
): void {
  const logger = new Logger(`Redis:${connectionName}`);
  let lastErrorSignature = '';
  let lastLoggedAt = 0;
  let hasLoggedReady = false;

  client.on('connect', () => {
    logger.log('Socket connected.');
  });

  client.on('ready', () => {
    if (!hasLoggedReady) {
      logger.log('Connection ready.');
      hasLoggedReady = true;
      return;
    }

    logger.warn('Connection restored and ready.');
  });

  client.on('reconnecting', (delay: number) => {
    logger.warn(`Reconnecting in ${delay}ms.`);
  });

  client.on('close', () => {
    logger.warn('Connection closed.');
  });

  client.on('end', () => {
    logger.warn('Connection ended.');
  });

  client.on('error', (error: Error) => {
    const signature = `${error.name}:${error.message}`;
    const now = Date.now();

    if (signature !== lastErrorSignature || now - lastLoggedAt >= 10000) {
      if (error.message.includes('ECONNRESET')) {
        logger.warn(`Transient Redis network reset: ${error.message}`);
      } else {
        logger.error(error.message);
      }
      lastErrorSignature = signature;
      lastLoggedAt = now;
    }
  });
}
