import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  CHAT_REDIS_CHANNELS,
  ChatRedisChannel,
} from '../common/constants/chat-redis-channels';
import { isNumber, isRecord, isString } from '../common/utils/type-guards';
import type {
  ChatMessagePayload,
  MessageNewEventPayload,
  PublicUser,
  RoomDeletedEventPayload,
  RoomSummaryPayload,
  RoomUserJoinedEventPayload,
  RoomUserLeftEventPayload,
} from '../common/types/chat-events';
import { EnvironmentVariables } from '../config/env.validation';
import { REDIS_SUBSCRIBER } from '../redis/redis.constants';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class ChatEventsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ChatEventsService.name);
  private readonly channels = [
    CHAT_REDIS_CHANNELS.messageNew,
    CHAT_REDIS_CHANNELS.roomUserJoined,
    CHAT_REDIS_CHANNELS.roomUserLeft,
    CHAT_REDIS_CHANNELS.roomDeleted,
  ] as const;

  constructor(
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
    private readonly gateway: ChatGateway,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.configService.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }

    this.subscriber.on('message', this.handleRedisMessage);
    await this.subscriber.subscribe(...this.channels);
  }

  onApplicationShutdown(): void {
    this.subscriber.off('message', this.handleRedisMessage);
  }

  private readonly handleRedisMessage = (
    channel: string,
    payload: string,
  ): void => {
    void this.routeRedisMessage(channel, payload);
  };

  private async routeRedisMessage(
    channel: string,
    payload: string,
  ): Promise<void> {
    try {
      switch (channel) {
        case CHAT_REDIS_CHANNELS.messageNew:
          this.gateway.emitMessageNew(
            this.parseChannelPayload(CHAT_REDIS_CHANNELS.messageNew, payload),
          );
          return;
        case CHAT_REDIS_CHANNELS.roomUserJoined:
          this.gateway.emitRoomUserJoined(
            this.parseChannelPayload(
              CHAT_REDIS_CHANNELS.roomUserJoined,
              payload,
            ),
          );
          return;
        case CHAT_REDIS_CHANNELS.roomUserLeft:
          this.gateway.emitRoomUserLeft(
            this.parseChannelPayload(CHAT_REDIS_CHANNELS.roomUserLeft, payload),
          );
          return;
        case CHAT_REDIS_CHANNELS.roomDeleted:
          await this.gateway.emitRoomDeleted(
            this.parseChannelPayload(CHAT_REDIS_CHANNELS.roomDeleted, payload),
          );
          return;
        default:
          this.logger.warn(`Received unsupported Redis channel: ${channel}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process Redis event from ${channel}`,
        error as Error,
      );
    }
  }

  private parseChannelPayload(
    channel: typeof CHAT_REDIS_CHANNELS.messageNew,
    payload: string,
  ): MessageNewEventPayload;
  private parseChannelPayload(
    channel: typeof CHAT_REDIS_CHANNELS.roomUserJoined,
    payload: string,
  ): RoomUserJoinedEventPayload;
  private parseChannelPayload(
    channel: typeof CHAT_REDIS_CHANNELS.roomUserLeft,
    payload: string,
  ): RoomUserLeftEventPayload;
  private parseChannelPayload(
    channel: typeof CHAT_REDIS_CHANNELS.roomDeleted,
    payload: string,
  ): RoomDeletedEventPayload;
  private parseChannelPayload(
    channel: ChatRedisChannel,
    payload: string,
  ): unknown {
    const parsed = JSON.parse(payload) as unknown;

    switch (channel) {
      case CHAT_REDIS_CHANNELS.messageNew:
        if (this.isMessageNewEventPayload(parsed)) {
          return parsed;
        }
        break;
      case CHAT_REDIS_CHANNELS.roomUserJoined:
        if (this.isRoomUserJoinedEventPayload(parsed)) {
          return parsed;
        }
        break;
      case CHAT_REDIS_CHANNELS.roomUserLeft:
        if (this.isRoomUserLeftEventPayload(parsed)) {
          return parsed;
        }
        break;
      case CHAT_REDIS_CHANNELS.roomDeleted:
        if (this.isRoomDeletedEventPayload(parsed)) {
          return parsed;
        }
        break;
    }

    throw new Error(`Invalid payload for Redis channel ${channel}`);
  }

  private isPublicUser(value: unknown): value is PublicUser {
    if (!isRecord(value) || !isString(value.id) || !isString(value.username)) {
      return false;
    }

    return value.createdAt === undefined || isString(value.createdAt);
  }

  private isRoomSummaryPayload(value: unknown): value is RoomSummaryPayload {
    return (
      isRecord(value) &&
      isString(value.id) &&
      isString(value.name) &&
      isString(value.creatorId) &&
      isString(value.createdAt) &&
      isNumber(value.activeUsers)
    );
  }

  private isChatMessagePayload(value: unknown): value is ChatMessagePayload {
    return (
      isRecord(value) &&
      isString(value.id) &&
      isString(value.roomId) &&
      isString(value.content) &&
      isString(value.createdAt) &&
      this.isPublicUser(value.user)
    );
  }

  private isMessageNewEventPayload(
    value: unknown,
  ): value is MessageNewEventPayload {
    return (
      isRecord(value) &&
      isString(value.roomId) &&
      this.isChatMessagePayload(value.message)
    );
  }

  private isRoomUserJoinedEventPayload(
    value: unknown,
  ): value is RoomUserJoinedEventPayload {
    return (
      isRecord(value) &&
      isString(value.roomId) &&
      this.isPublicUser(value.user) &&
      isNumber(value.activeUsers) &&
      isString(value.timestamp)
    );
  }

  private isRoomUserLeftEventPayload(
    value: unknown,
  ): value is RoomUserLeftEventPayload {
    return (
      isRecord(value) &&
      isString(value.roomId) &&
      this.isPublicUser(value.user) &&
      isNumber(value.activeUsers) &&
      isString(value.timestamp)
    );
  }

  private isRoomDeletedEventPayload(
    value: unknown,
  ): value is RoomDeletedEventPayload {
    return (
      isRecord(value) &&
      isString(value.roomId) &&
      isString(value.roomName) &&
      this.isPublicUser(value.deletedBy) &&
      isString(value.deletedAt)
    );
  }
}
