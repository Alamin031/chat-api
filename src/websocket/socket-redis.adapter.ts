import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions } from 'socket.io';
import { attachRedisErrorHandler } from '../redis/redis.utils';

export class SocketRedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(SocketRedisIoAdapter.name);
  private readonly pubClient: Redis;
  private subClient?: Redis;
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext, pubClient: Redis) {
    super(app);
    this.pubClient = pubClient;
  }

  async connectToRedis(): Promise<void> {
    if (this.adapterConstructor) {
      return;
    }

    if (this.pubClient.status === 'wait') {
      await this.pubClient.connect();
    }

    const subClient = this.pubClient.duplicate({
      connectionName: 'chat-api-socket-adapter-subscriber',
    });

    attachRedisErrorHandler(subClient, 'chat-api-socket-adapter-subscriber');

    if (subClient.status === 'wait') {
      await subClient.connect();
    }

    this.subClient = subClient;
    this.adapterConstructor = createAdapter(this.pubClient, subClient);
    this.logger.log('Socket.IO Redis adapter connected.');
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    if (!this.adapterConstructor) {
      throw new Error(
        'SocketRedisIoAdapter is not connected. Call connectToRedis() before using it.',
      );
    }

    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }

  async dispose(): Promise<void> {
    if (!this.subClient || this.subClient.status === 'end') {
      return;
    }

    const subClient = this.subClient;
    this.subClient = undefined;

    try {
      await subClient.quit();
    } catch {
      subClient.disconnect(false);
    }
  }
}
