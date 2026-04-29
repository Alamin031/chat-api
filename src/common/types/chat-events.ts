export interface AuthenticatedUserPayload {
  id: string;
  username: string;
  createdAt: string;
}

export interface RoomSummaryPayload {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  activeUsers: number;
}

export interface RoomPayload {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface ChatMessagePayload {
  id: string;
  roomId: string;
  username: string;
  content: string;
  createdAt: string;
}

export interface RoomJoinedEventPayload {
  activeUsers: string[];
}

export interface RoomUserJoinedEventPayload {
  roomId: string;
  socketId: string;
  username: string;
  activeUsers: string[];
}

export interface RoomUserLeftEventPayload {
  roomId: string;
  socketId: string;
  username: string;
  activeUsers: string[];
}

export interface MessageNewEventPayload {
  roomId: string;
  message: ChatMessagePayload;
}

export interface RoomDeletedEventPayload {
  roomId: string;
}
