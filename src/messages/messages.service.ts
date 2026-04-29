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

interface MessageRow {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  createdAt: Date;
  username: string;
  userCreatedAt: Date;
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
    const cursor = before ? this.decodeCursor(before) : null;

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
        userId: messages.userId,
        content: messages.content,
        createdAt: messages.createdAt,
        username: users.username,
        userCreatedAt: users.createdAt,
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
        ? this.encodeCursor(pageRows[pageRows.length - 1])
        : null;

    return {
      messages: serializedMessages,
      hasMore,
      nextCursor,
    };
  }

  async createRoomMessage(roomId: string, content: string, currentUser: User) {
    await this.roomsService.findByIdOrThrow(roomId);

    const [message] = await this.db
      .insert(messages)
      .values({
        roomId,
        userId: currentUser.id,
        content,
      })
      .returning();

    if (!message) {
      throw new AppException(
        'MESSAGE_CREATE_FAILED',
        'Unable to send the message right now.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const serializedMessage = serializeMessage(message, currentUser);
    const payload: MessageNewEventPayload = {
      roomId,
      message: serializedMessage,
    };

    await this.redisService.publish(CHAT_REDIS_CHANNELS.messageNew, payload);

    return serializedMessage;
  }

  private serializeJoinedMessage(row: MessageRow) {
    const messageEntity: Pick<
      Message,
      'id' | 'roomId' | 'content' | 'createdAt'
    > = {
      id: row.id,
      roomId: row.roomId,
      content: row.content,
      createdAt: row.createdAt,
    };

    return serializeMessage(messageEntity, {
      id: row.userId,
      username: row.username,
      createdAt: row.userCreatedAt,
    });
  }

  private encodeCursor(row: Pick<MessageRow, 'createdAt' | 'id'>): string {
    return Buffer.from(
      JSON.stringify({
        createdAt: row.createdAt.toISOString(),
        id: row.id,
      } satisfies CursorPayload),
      'utf8',
    ).toString('base64url');
  }

  private decodeCursor(before: string): CursorPayload {
    try {
      const parsed = JSON.parse(
        Buffer.from(before, 'base64url').toString('utf8'),
      ) as CursorPayload;

      if (
        !parsed ||
        typeof parsed.id !== 'string' ||
        typeof parsed.createdAt !== 'string' ||
        Number.isNaN(new Date(parsed.createdAt).getTime())
      ) {
        throw new Error('Invalid cursor');
      }

      return parsed;
    } catch {
      throw new AppException(
        'INVALID_CURSOR',
        'The pagination cursor is invalid.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
