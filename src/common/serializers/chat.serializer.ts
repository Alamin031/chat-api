import { Message, Room, User } from '../../database/schema';
import {
  AuthenticatedUserPayload,
  ChatMessagePayload,
  RoomPayload,
  RoomSummaryPayload,
} from '../types/chat-events';

export function serializeUser(
  user: Pick<User, 'id' | 'username' | 'createdAt'>,
): AuthenticatedUserPayload {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
  };
}

export function serializeRoomSummary(
  room: Pick<Room, 'id' | 'name' | 'createdAt'>,
  createdBy: string,
  activeUsers: number,
): RoomSummaryPayload {
  return {
    id: room.id,
    name: room.name,
    createdBy,
    createdAt: room.createdAt.toISOString(),
    activeUsers,
  };
}

export function serializeRoom(
  room: Pick<Room, 'id' | 'name' | 'createdAt'>,
  createdBy: string,
): RoomPayload {
  return {
    id: room.id,
    name: room.name,
    createdBy,
    createdAt: room.createdAt.toISOString(),
  };
}

export function serializeMessage(
  message: Pick<Message, 'id' | 'roomId' | 'content' | 'createdAt'>,
  username: string,
): ChatMessagePayload {
  return {
    id: message.id,
    roomId: message.roomId,
    username,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}
