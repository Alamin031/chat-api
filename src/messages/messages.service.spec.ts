import { HttpStatus } from '@nestjs/common';
import { CHAT_REDIS_CHANNELS } from '../common/constants/chat-redis-channels';
import type { User } from '../database/schema';
import { MessagesService } from './messages.service';

describe('MessagesService contract', () => {
  const roomId = '11111111-1111-1111-1111-111111111111';
  const user: User = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'ali_123',
    createdAt: new Date('2024-03-01T10:00:00Z'),
  };

  function createService(overrides?: {
    db?: Record<string, unknown>;
    roomsService?: Record<string, unknown>;
    redisService?: Record<string, unknown>;
  }) {
    const db = overrides?.db ?? {};
    const roomsService = {
      findByIdOrThrow: jest.fn().mockResolvedValue({ id: roomId }),
      ...overrides?.roomsService,
    };
    const redisService = {
      publish: jest.fn().mockResolvedValue(1),
      ...overrides?.redisService,
    };

    return {
      service: new MessagesService(
        db as never,
        roomsService as never,
        redisService as never,
      ),
      db,
      roomsService,
      redisService,
    };
  }

  it('creates a trimmed message with the required REST shape and Redis payload', async () => {
    const createdAt = new Date('2024-03-01T10:05:22Z');
    const insertBuilder = {
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([
        {
          id: '33333333-3333-3333-3333-333333333333',
          roomId,
          userId: user.id,
          content: 'hello everyone',
          createdAt,
        },
      ]),
    };
    const db = {
      insert: jest.fn().mockReturnValue(insertBuilder),
    };
    const { service, redisService } = createService({ db });

    const result = await service.createRoomMessage(roomId, '  hello everyone  ', user);

    expect(insertBuilder.values).toHaveBeenCalledWith({
      roomId,
      userId: user.id,
      content: 'hello everyone',
    });
    expect(result).toEqual({
      id: '33333333-3333-3333-3333-333333333333',
      roomId,
      username: 'ali_123',
      content: 'hello everyone',
      createdAt: createdAt.toISOString(),
    });
    expect(redisService.publish).toHaveBeenCalledWith(
      CHAT_REDIS_CHANNELS.messageNew,
      {
        roomId,
        message: result,
      },
    );
  });

  it('returns 422 when message content is empty after trimming', async () => {
    const { service } = createService();

    await expect(service.createRoomMessage(roomId, '   ', user)).rejects.toMatchObject({
      response: {
        code: 'MESSAGE_EMPTY',
        message: 'Message content must not be empty',
      },
      status: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  });

  it('uses message IDs for before/nextCursor and returns top-level usernames', async () => {
    const cursorLookup = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        {
          id: '44444444-4444-4444-4444-444444444444',
          createdAt: new Date('2024-03-01T10:04:00Z'),
        },
      ]),
    };
    const listQuery = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        {
          id: '55555555-5555-5555-5555-555555555555',
          roomId,
          content: 'latest',
          createdAt: new Date('2024-03-01T10:03:00Z'),
          username: 'sara_x',
        },
        {
          id: '66666666-6666-6666-6666-666666666666',
          roomId,
          content: 'older',
          createdAt: new Date('2024-03-01T10:02:00Z'),
          username: 'ali_123',
        },
        {
          id: '77777777-7777-7777-7777-777777777777',
          roomId,
          content: 'oldest',
          createdAt: new Date('2024-03-01T10:01:00Z'),
          username: 'ali_123',
        },
      ]),
    };
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(cursorLookup)
        .mockReturnValueOnce(listQuery),
    };
    const { service } = createService({ db });

    const result = await service.listRoomMessages(
      roomId,
      2,
      '44444444-4444-4444-4444-444444444444',
    );

    expect(result).toEqual({
      messages: [
        {
          id: '55555555-5555-5555-5555-555555555555',
          roomId,
          username: 'sara_x',
          content: 'latest',
          createdAt: '2024-03-01T10:03:00.000Z',
        },
        {
          id: '66666666-6666-6666-6666-666666666666',
          roomId,
          username: 'ali_123',
          content: 'older',
          createdAt: '2024-03-01T10:02:00.000Z',
        },
      ],
      hasMore: true,
      nextCursor: '66666666-6666-6666-6666-666666666666',
    });
  });
});
