import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';

const SOCKET_META_TTL_SECONDS = 86400;

@Injectable()
export class RedisService implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.redis.quit(), this.subscriber.quit()]);
  }

  private getSessionKey(token: string): string {
    return `session:${token}`;
  }

  private getActiveUsersKey(roomId: string): string {
    return `room:${roomId}:active:users`;
  }

  private getUserConnectionCountKey(roomId: string, userId: string): string {
    return `room:${roomId}:user:${userId}:connections`;
  }

  private getSocketMetaKey(socketId: string): string {
    return `socket:${socketId}`;
  }

  // Session management
  async setSession(token: string, userId: string, ttl: number): Promise<void> {
    await this.redis.set(this.getSessionKey(token), userId, 'EX', ttl);
  }

  async getSession(token: string): Promise<string | null> {
    return this.redis.get(this.getSessionKey(token));
  }

  async deleteSession(token: string): Promise<void> {
    await this.redis.del(this.getSessionKey(token));
  }

  // Active user tracking per room
  async registerRoomConnection(
    roomId: string,
    userId: string,
  ): Promise<{ activeUsers: number; isFirstConnection: boolean }> {
    const results = await this.redis
      .multi()
      .incr(this.getUserConnectionCountKey(roomId, userId))
      .expire(
        this.getUserConnectionCountKey(roomId, userId),
        SOCKET_META_TTL_SECONDS,
      )
      .sadd(this.getActiveUsersKey(roomId), userId)
      .scard(this.getActiveUsersKey(roomId))
      .exec();

    if (!results) {
      throw new Error('Failed to register room connection.');
    }

    return {
      isFirstConnection: Number(results[0][1] ?? 0) === 1,
      activeUsers: Number(results[3][1] ?? 0),
    };
  }

  async unregisterRoomConnection(
    roomId: string,
    userId: string,
  ): Promise<{ activeUsers: number; didLeaveRoom: boolean }> {
    const remainingConnections = await this.redis.decr(
      this.getUserConnectionCountKey(roomId, userId),
    );

    if (remainingConnections > 0) {
      await this.redis.expire(
        this.getUserConnectionCountKey(roomId, userId),
        SOCKET_META_TTL_SECONDS,
      );

      return {
        didLeaveRoom: false,
        activeUsers: await this.redis.scard(this.getActiveUsersKey(roomId)),
      };
    }

    const results = await this.redis
      .multi()
      .del(this.getUserConnectionCountKey(roomId, userId))
      .srem(this.getActiveUsersKey(roomId), userId)
      .scard(this.getActiveUsersKey(roomId))
      .exec();

    if (!results) {
      throw new Error('Failed to unregister room connection.');
    }

    return {
      didLeaveRoom: Number(results[1][1] ?? 0) === 1,
      activeUsers: Number(results[2][1] ?? 0),
    };
  }

  async getActiveUserCount(roomId: string): Promise<number> {
    return this.redis.scard(this.getActiveUsersKey(roomId));
  }

  async getActiveCountsForRooms(
    roomIds: string[],
  ): Promise<Record<string, number>> {
    if (roomIds.length === 0) {
      return {};
    }

    const pipeline = this.redis.pipeline();
    for (const id of roomIds) {
      pipeline.scard(this.getActiveUsersKey(id));
    }

    const results = await pipeline.exec();
    const counts: Record<string, number> = {};

    roomIds.forEach((id, i) => {
      counts[id] = Number(results?.[i]?.[1] ?? 0);
    });

    return counts;
  }

  // Socket connection tracking (socketId -> { userId, roomId })
  async setSocketMeta(
    socketId: string,
    meta: { userId: string; roomId: string },
  ): Promise<void> {
    await this.redis.set(
      this.getSocketMetaKey(socketId),
      JSON.stringify(meta),
      'EX',
      SOCKET_META_TTL_SECONDS,
    );
  }

  async getSocketMeta(
    socketId: string,
  ): Promise<{ userId: string; roomId: string } | null> {
    const raw = await this.redis.get(this.getSocketMetaKey(socketId));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as { userId: string; roomId: string };
    } catch {
      await this.deleteSocketMeta(socketId);
      return null;
    }
  }

  async deleteSocketMeta(socketId: string): Promise<void> {
    await this.redis.del(this.getSocketMetaKey(socketId));
  }

  // Pub/Sub publish
  async publish(channel: string, message: unknown): Promise<number> {
    return this.redis.publish(channel, JSON.stringify(message));
  }
}
