import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { CHAT_REDIS_CHANNELS } from '../common/constants/chat-redis-channels';
import {
  serializeRoom,
  serializeUser,
} from '../common/serializers/chat.serializer';
import { RoomDeletedEventPayload } from '../common/types/chat-events';
import { AppException } from '../common/exceptions/app.exception';
import { DATABASE_TOKEN } from '../database';
import type { Database } from '../database';
import { Room, User, rooms } from '../database/schema';
import { RedisService } from '../redis/redis.service';

interface PostgresErrorLike {
  code?: string;
}

@Injectable()
export class RoomsService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly redisService: RedisService,
  ) {}

  async listRooms() {
    const roomEntities = await this.db
      .select()
      .from(rooms)
      .orderBy(desc(rooms.createdAt), desc(rooms.id));

    const activeCounts = await this.redisService.getActiveCountsForRooms(
      roomEntities.map((room) => room.id),
    );

    return roomEntities.map((room) =>
      serializeRoom(room, activeCounts[room.id] ?? 0),
    );
  }

  async createRoom(name: string, creator: User) {
    const existingRoom = await this.findByName(name);
    if (existingRoom) {
      throw new AppException(
        'ROOM_NAME_TAKEN',
        'A room with this name already exists.',
        HttpStatus.CONFLICT,
      );
    }

    try {
      const [room] = await this.db
        .insert(rooms)
        .values({
          name,
          creatorId: creator.id,
        })
        .returning();

      if (!room) {
        throw new AppException(
          'ROOM_CREATE_FAILED',
          'Unable to create the room right now.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return serializeRoom(room, 0);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new AppException(
          'ROOM_NAME_TAKEN',
          'A room with this name already exists.',
          HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  async getRoomDetails(roomId: string) {
    const room = await this.findByIdOrThrow(roomId);
    const activeUsers = await this.redisService.getActiveUserCount(room.id);
    return serializeRoom(room, activeUsers);
  }

  async deleteRoom(roomId: string, currentUser: User) {
    const room = await this.findByIdOrThrow(roomId);

    if (room.creatorId !== currentUser.id) {
      throw new AppException(
        'FORBIDDEN_ROOM_DELETE',
        'Only the room creator can delete this room.',
        HttpStatus.FORBIDDEN,
      );
    }

    const payload: RoomDeletedEventPayload = {
      roomId: room.id,
      roomName: room.name,
      deletedBy: serializeUser(currentUser),
      deletedAt: new Date().toISOString(),
    };

    await this.redisService.publish(CHAT_REDIS_CHANNELS.roomDeleted, payload);
    await this.db.delete(rooms).where(eq(rooms.id, room.id));

    return {
      deleted: true,
      roomId: room.id,
    };
  }

  async findById(roomId: string): Promise<Room | null> {
    const [room] = await this.db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);
    return room ?? null;
  }

  async findByIdOrThrow(roomId: string): Promise<Room> {
    const room = await this.findById(roomId);

    if (!room) {
      throw new AppException(
        'ROOM_NOT_FOUND',
        'Room not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return room;
  }

  private async findByName(name: string): Promise<Room | null> {
    const [room] = await this.db
      .select()
      .from(rooms)
      .where(eq(rooms.name, name))
      .limit(1);
    return room ?? null;
  }

  private isUniqueViolation(error: unknown): error is PostgresErrorLike {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as PostgresErrorLike).code === '23505'
    );
  }
}
