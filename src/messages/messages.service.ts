import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { CHAT_REDIS_CHANNELS } from '../common/constants/chat-redis-channels';
import { serializeMessage } from '../common/serializers/chat.serializer';
import { MessageNewEventPayload } from '../common/types/chat-events';
import { AppException } from '../common/exceptions/app.exception';
import { DATABASE_TOKEN } from '../database';
import type { Database } from '../database';
import { Message, User, messages, users } from '../database/schema';
import { RedisService } from '../redis/redis.service';
import { RoomsService } from '../rooms/rooms.service';

interface CursorPayload {
  createdAt: string;
  id: string;
}

@Injectable()
export class MessagesService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly roomsService: RoomsService,
    private readonly redisService: RedisService,
  ) {}

  async listRoomMessages(roomId: string, limit = 50, before?: string) {
    await this.roomsService.findByIdOrThrow(roomId);

    const take = Math.min(limit, 100);
    const cursor = before ? await this.resolveCursor(roomId, before) : null;

    const conditions = [eq(messages.roomId, roomId)];

    if (cursor) {
      const cursorDate = new Date(cursor.createdAt);
      conditions.push(
        or(
          lt(messages.createdAt, cursorDate),
          and(eq(messages.createdAt, cursorDate), lt(messages.id, cursor.id)),
        )!,
      );
    }

    const rows = await this.db
      .select({
        id: messages.id,
        roomId: messages.roomId,
        content: messages.content,
        createdAt: messages.createdAt,
        username: users.username,
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(take + 1);

    const hasMore = rows.length > take;
    const pageRows = hasMore ? rows.slice(0, take) : rows;
    const serializedMessages = pageRows.map((row) =>
      this.serializeJoinedMessage(row),
    );
    const nextCursor =
      hasMore && pageRows.length > 0
        ? pageRows[pageRows.length - 1].id
        : null;

    return {
      messages: serializedMessages,
      hasMore,
      nextCursor,
    };
  }

  async createRoomMessage(roomId: string, content: string, currentUser: User) {
    await this.roomsService.findByIdOrThrow(roomId);
    const normalizedContent = this.validateMessageContent(content);

    const [message] = await this.db
      .insert(messages)
      .values({
        roomId,
        userId: currentUser.id,
        content: normalizedContent,
      })
      .returning();

    if (!message) {
      throw new AppException(
        'MESSAGE_CREATE_FAILED',
        'Unable to send the message right now.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const serializedMessage = serializeMessage(message, currentUser.username);
    const payload: MessageNewEventPayload = {
      roomId,
      message: serializedMessage,
    };

    await this.redisService.publish(CHAT_REDIS_CHANNELS.messageNew, payload);

    return serializedMessage;
  }

  private serializeJoinedMessage(
    row: Pick<Message, 'id' | 'roomId' | 'content' | 'createdAt'> & {
      username: string;
    },
  ) {
    const messageEntity: Pick<
      Message,
      'id' | 'roomId' | 'content' | 'createdAt'
    > = {
      id: row.id,
      roomId: row.roomId,
      content: row.content,
      createdAt: row.createdAt,
    };

    return serializeMessage(messageEntity, row.username);
  }

  private async resolveCursor(
    roomId: string,
    messageId: string,
  ): Promise<CursorPayload> {
    const [message] = await this.db
      .select({
        id: messages.id,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(eq(messages.roomId, roomId), eq(messages.id, messageId)))
      .limit(1);

    if (!message) {
      throw new AppException(
        'INVALID_CURSOR',
        'The pagination cursor is invalid.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      id: message.id,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private validateMessageContent(content: string): string {
    const trimmedContent = content.trim();

    if (trimmedContent.length === 0) {
      throw new AppException(
        'MESSAGE_EMPTY',
        'Message content must not be empty',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (trimmedContent.length > 1000) {
      throw new AppException(
        'MESSAGE_TOO_LONG',
        'Message content must not exceed 1000 characters',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return trimmedContent;
  }
}
