import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { HttpStatus, Logger } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Namespace, Socket } from 'socket.io';
import { CHAT_REDIS_CHANNELS } from '../common/constants/chat-redis-channels';
import {
  MessageNewEventPayload,
  RoomDeletedEventPayload,
  RoomJoinedEventPayload,
  RoomUserJoinedEventPayload,
  RoomUserLeftEventPayload,
} from '../common/types/chat-events';
import { isString } from '../common/utils/type-guards';
import { Room, User } from '../database/schema';
import { RedisService } from '../redis/redis.service';
import { RoomsService } from '../rooms/rooms.service';
import { UsersService } from '../users/users.service';

interface SocketErrorData {
  statusCode: number;
  code: string;
  message: string;
}

interface ChatSocket extends Socket {
  data: {
    user?: User;
    room?: Room;
    cleanedUp?: boolean;
  };
}

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
    private readonly roomsService: RoomsService,
  ) {}

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      void this.authenticateSocket(socket as ChatSocket, next);
    });
  }

  async handleConnection(socket: ChatSocket): Promise<void> {
    const user = socket.data.user;
    const room = socket.data.room;

    if (!user || !room) {
      socket.disconnect(true);
      return;
    }

    try {
      await socket.join(room.id);
      await this.redisService.setSocketMeta(socket.id, {
        userId: user.id,
        roomId: room.id,
      });

      const presence = await this.redisService.registerRoomConnection(
        room.id,
        user.id,
      );
      const activeUsers = await this.getActiveUsernames(room.id);
      const roomJoinedPayload: RoomJoinedEventPayload = {
        activeUsers,
      };

      socket.emit('room:joined', roomJoinedPayload);

      if (presence.isFirstConnection) {
        await this.redisService.publish(CHAT_REDIS_CHANNELS.roomUserJoined, {
          roomId: room.id,
          socketId: socket.id,
          username: user.username,
          activeUsers,
        });
      }
    } catch (error) {
      this.logger.error(
        'Failed to initialize socket connection',
        error as Error,
      );
      await this.cleanupSocketConnection(socket, false);
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: ChatSocket): Promise<void> {
    await this.cleanupSocketConnection(socket, true);
  }

  @SubscribeMessage('room:leave')
  async handleRoomLeave(@ConnectedSocket() socket: ChatSocket): Promise<void> {
    await this.cleanupSocketConnection(socket, true);
    socket.disconnect(true);
  }

  emitMessageNew(payload: MessageNewEventPayload): void {
    // Redis pub/sub already fans events out to every app instance.
    // Keep this local so the Socket.IO Redis adapter does not rebroadcast duplicates.
    this.server.local.to(payload.roomId).emit('message:new', {
      id: payload.message.id,
      username: payload.message.username,
      content: payload.message.content,
      createdAt: payload.message.createdAt,
    });
  }

  emitRoomUserJoined(payload: RoomUserJoinedEventPayload): void {
    this.server.local
      .to(payload.roomId)
      .except(payload.socketId)
      .emit('room:user_joined', {
        username: payload.username,
        activeUsers: payload.activeUsers,
      });
  }

  emitRoomUserLeft(payload: RoomUserLeftEventPayload): void {
    this.server.local
      .to(payload.roomId)
      .except(payload.socketId)
      .emit('room:user_left', {
        username: payload.username,
        activeUsers: payload.activeUsers,
      });
  }

  async emitRoomDeleted(payload: RoomDeletedEventPayload): Promise<void> {
    this.server.local.to(payload.roomId).emit('room:deleted', {
      roomId: payload.roomId,
    });
    await this.disconnectLocalRoomSockets(payload.roomId);
  }

  private async authenticateSocket(
    socket: ChatSocket,
    next: (error?: Error) => void,
  ): Promise<void> {
    const token = this.extractSingleQueryValue(socket.handshake.query.token);
    if (!token) {
      next(
        this.createSocketError(
          HttpStatus.UNAUTHORIZED,
          'UNAUTHORIZED',
          'Missing or expired session token',
        ),
      );
      return;
    }

    const roomId = this.extractSingleQueryValue(socket.handshake.query.roomId);
    if (!roomId || !isUUID(roomId)) {
      next(
        this.createSocketError(
          HttpStatus.BAD_REQUEST,
          'INVALID_ROOM_ID',
          'A valid roomId query parameter is required.',
        ),
      );
      return;
    }

    const userId = await this.redisService.getSession(token);
    if (!userId) {
      next(
        this.createSocketError(
          HttpStatus.UNAUTHORIZED,
          'UNAUTHORIZED',
          'Missing or expired session token',
        ),
      );
      return;
    }

    const [user, room] = await Promise.all([
      this.usersService.findById(userId),
      this.roomsService.findById(roomId),
    ]);

    if (!user) {
      next(
        this.createSocketError(
          HttpStatus.UNAUTHORIZED,
          'UNAUTHORIZED',
          'Missing or expired session token',
        ),
      );
      return;
    }

    if (!room) {
      next(
        this.createSocketError(
          HttpStatus.NOT_FOUND,
          'ROOM_NOT_FOUND',
          `Room with id ${roomId} does not exist`,
        ),
      );
      return;
    }

    socket.data.user = user;
    socket.data.room = room;
    next();
  }

  private async cleanupSocketConnection(
    socket: ChatSocket,
    publishLeaveEvent: boolean,
  ): Promise<void> {
    if (socket.data.cleanedUp) {
      return;
    }

    socket.data.cleanedUp = true;

    const meta =
      (await this.redisService.getSocketMeta(socket.id)) ??
      this.buildSocketMetaFallback(socket);

    if (!meta) {
      return;
    }

    const presence = await this.redisService.unregisterRoomConnection(
      meta.roomId,
      meta.userId,
    );
    await this.redisService.deleteSocketMeta(socket.id);

    if (publishLeaveEvent && presence.didLeaveRoom) {
      const user =
        socket.data.user ?? (await this.usersService.findById(meta.userId));
      if (user) {
        const activeUsers = await this.getActiveUsernames(meta.roomId);
        await this.redisService.publish(CHAT_REDIS_CHANNELS.roomUserLeft, {
          roomId: meta.roomId,
          socketId: socket.id,
          username: user.username,
          activeUsers,
        });
      }
    }
  }

  private async disconnectLocalRoomSockets(roomId: string): Promise<void> {
    const socketIds = this.server.adapter.rooms.get(roomId);
    if (!socketIds || socketIds.size === 0) {
      return;
    }

    for (const socketId of socketIds) {
      const socket = this.server.sockets.get(socketId) as ChatSocket | undefined;
      if (!socket) {
        continue;
      }

      await this.cleanupSocketConnection(socket, false);
      socket.disconnect(true);
    }
  }

  private buildSocketMetaFallback(
    socket: ChatSocket,
  ): { userId: string; roomId: string } | null {
    if (!socket.data.user || !socket.data.room) {
      return null;
    }

    return {
      userId: socket.data.user.id,
      roomId: socket.data.room.id,
    };
  }

  private extractSingleQueryValue(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (Array.isArray(value) && value.length > 0) {
      const values = value as readonly unknown[];
      const firstValue = values[0];
      return isString(firstValue) && firstValue.trim().length > 0
        ? firstValue.trim()
        : null;
    }

    return null;
  }

  private async getActiveUsernames(roomId: string): Promise<string[]> {
    const activeUserIds = await this.redisService.getActiveUserIds(roomId);
    return this.usersService.findUsernamesByIds(activeUserIds);
  }

  private createSocketError(
    statusCode: number,
    code: string,
    message: string,
  ): Error {
    const error = new Error(message) as Error & { data?: SocketErrorData };
    error.data = {
      statusCode,
      code,
      message,
    };
    return error;
  }
}
