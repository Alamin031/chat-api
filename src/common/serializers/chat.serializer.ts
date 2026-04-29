import { Message, Room, User } from '../../database/schema';
import {
  ChatMessagePayload,
  PublicUser,
  RoomSummaryPayload,
} from '../types/chat-events';

type SerializableUser =
  | Pick<User, 'id' | 'username' | 'createdAt'>
  | PublicUser;

export function serializeUser(user: SerializableUser): PublicUser {
  if (typeof user.createdAt === 'string' || user.createdAt === undefined) {
    return {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
    };
  }

  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
  };
}

export function serializeRoom(
  room: Pick<Room, 'id' | 'name' | 'creatorId' | 'createdAt'>,
  activeUsers: number,
): RoomSummaryPayload {
  return {
    id: room.id,
    name: room.name,
    creatorId: room.creatorId,
    createdAt: room.createdAt.toISOString(),
    activeUsers,
  };
}

export function serializeMessage(
  message: Pick<Message, 'id' | 'roomId' | 'content' | 'createdAt'>,
  user: SerializableUser,
): ChatMessagePayload {
  return {
    id: message.id,
    roomId: message.roomId,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    user: serializeUser(user),
  };
}
