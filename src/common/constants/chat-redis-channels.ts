export const CHAT_REDIS_CHANNELS = {
  messageNew: 'message:new',
  roomUserJoined: 'room:user_joined',
  roomUserLeft: 'room:user_left',
  roomDeleted: 'room:deleted',
} as const;

export type ChatRedisChannel =
  (typeof CHAT_REDIS_CHANNELS)[keyof typeof CHAT_REDIS_CHANNELS];
