import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { serializeUser } from '../common/serializers/chat.serializer';
import { AppException } from '../common/exceptions/app.exception';
import { EnvironmentVariables } from '../config/env.validation';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';

interface PostgresErrorLike {
  code?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async login(username: string) {
    let user = await this.usersService.findByUsername(username);

    if (!user) {
      try {
        user = await this.usersService.create({ username });
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          user = await this.usersService.findByUsername(username);
        } else {
          throw error;
        }
      }
    }

    if (!user) {
      throw new AppException(
        'USER_LOGIN_FAILED',
        'Unable to log the user in right now.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const token = randomBytes(32).toString('hex');
    const expiresIn = this.configService.get('SESSION_TTL_SECONDS', {
      infer: true,
    });

    await this.redisService.setSession(token, user.id, expiresIn);

    return {
      token,
      expiresIn,
      user: serializeUser(user),
    };
  }

  private isUniqueViolation(error: unknown): error is PostgresErrorLike {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as PostgresErrorLike).code === '23505'
    );
  }
}
