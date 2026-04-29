export interface PublicUser {
  id: string;
  username: string;
  createdAt?: string;
}

export interface RoomSummaryPayload {
  id: string;
  name: string;
  creatorId: string;
  createdAt: string;
  activeUsers: number;
}

export interface ChatMessagePayload {
  id: string;
  roomId: string;
  content: string;
  createdAt: string;
  user: PublicUser;
}

export interface RoomJoinedEventPayload {
  room: RoomSummaryPayload;
  user: PublicUser;
  activeUsers: number;
  timestamp: string;
}

export interface RoomUserJoinedEventPayload {
  roomId: string;
  user: PublicUser;
  activeUsers: number;
  timestamp: string;
}

export interface RoomUserLeftEventPayload {
  roomId: string;
  user: PublicUser;
  activeUsers: number;
  timestamp: string;
}

export interface MessageNewEventPayload {
  roomId: string;
  message: ChatMessagePayload;
}

export interface RoomDeletedEventPayload {
  roomId: string;
  roomName: string;
  deletedBy: PublicUser;
  deletedAt: string;
}
