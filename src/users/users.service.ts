import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AppException } from '../common/exceptions/app.exception';
import { DATABASE_TOKEN } from '../database';
import type { Database } from '../database';
import { NewUser, User, users } from '../database/schema';

@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  async findById(id: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    return user ?? null;
  }

  async create(payload: NewUser): Promise<User> {
    const [user] = await this.db.insert(users).values(payload).returning();

    if (!user) {
      throw new AppException(
        'USER_CREATE_FAILED',
        'Unable to create the user right now.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return user;
  }
}
