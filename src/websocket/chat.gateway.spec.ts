import { CHAT_REDIS_CHANNELS } from '../common/constants/chat-redis-channels';
import type {
  MessageNewEventPayload,
  RoomUserJoinedEventPayload,
} from '../common/types/chat-events';
import { ChatGateway } from './chat.gateway';

describe('ChatGateway contract', () => {
  function createGateway() {
    const redisService = {
      setSocketMeta: jest.fn().mockResolvedValue(undefined),
      registerRoomConnection: jest
        .fn()
        .mockResolvedValue({ activeUsers: 2, isFirstConnection: true }),
      getActiveUserIds: jest
        .fn()
        .mockResolvedValue([
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
        ]),
      publish: jest.fn().mockResolvedValue(1),
    };
    const usersService = {
      findUsernamesByIds: jest
        .fn()
        .mockResolvedValue(['ali_123', 'sara_x']),
    };
    const roomsService = {};

    return {
      gateway: new ChatGateway(
        redisService as never,
        usersService as never,
        roomsService as never,
      ),
      redisService,
    };
  }

  it('emits room:joined only to the connecting socket with the exact payload shape', async () => {
    const { gateway, redisService } = createGateway();
    const socket = {
      id: 'socket-1',
      data: {
        user: {
          id: '22222222-2222-2222-2222-222222222222',
          username: 'ali_123',
          createdAt: new Date('2024-03-01T10:00:00Z'),
        },
        room: {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'general',
          creatorId: '22222222-2222-2222-2222-222222222222',
          createdAt: new Date('2024-03-01T09:00:00Z'),
        },
      },
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    await gateway.handleConnection(socket as never);

    expect(socket.emit).toHaveBeenCalledWith('room:joined', {
      activeUsers: ['ali_123', 'sara_x'],
    });
    expect(redisService.publish).toHaveBeenCalledWith(
      CHAT_REDIS_CHANNELS.roomUserJoined,
      {
        roomId: '11111111-1111-1111-1111-111111111111',
        socketId: 'socket-1',
        username: 'ali_123',
        activeUsers: ['ali_123', 'sara_x'],
      },
    );
  });

  it('broadcasts exact client-facing websocket payloads', () => {
    const { gateway } = createGateway();
    const emit = jest.fn();
    const except = jest.fn().mockReturnValue({ emit });
    const to = jest.fn().mockReturnValue({ emit, except });

    gateway.server = {
      local: {
        to,
      },
    } as never;

    const messagePayload: MessageNewEventPayload = {
      roomId: '11111111-1111-1111-1111-111111111111',
      message: {
        id: '88888888-8888-8888-8888-888888888888',
        roomId: '11111111-1111-1111-1111-111111111111',
        username: 'ali_123',
        content: 'hello everyone',
        createdAt: '2024-03-01T10:05:22.000Z',
      },
    };
    const joinedPayload: RoomUserJoinedEventPayload = {
      roomId: '11111111-1111-1111-1111-111111111111',
      socketId: 'socket-1',
      username: 'sara_x',
      activeUsers: ['ali_123', 'sara_x'],
    };

    gateway.emitMessageNew(messagePayload);
    gateway.emitRoomUserJoined(joinedPayload);

    expect(emit).toHaveBeenNthCalledWith(1, 'message:new', {
      id: '88888888-8888-8888-8888-888888888888',
      username: 'ali_123',
      content: 'hello everyone',
      createdAt: '2024-03-01T10:05:22.000Z',
    });
    expect(except).toHaveBeenCalledWith('socket-1');
    expect(emit).toHaveBeenNthCalledWith(2, 'room:user_joined', {
      username: 'sara_x',
      activeUsers: ['ali_123', 'sara_x'],
    });
  });
});
