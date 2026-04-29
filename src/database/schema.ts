import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').unique().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    usernameIdx: index('idx_users_username').on(table.username),
    usernameLengthCheck: check(
      'users_username_length_check',
      sql`char_length(${table.username}) between 2 and 24`,
    ),
    usernameFormatCheck: check(
      'users_username_format_check',
      sql`${table.username} ~ '^[A-Za-z0-9_]+$'`,
    ),
  }),
);

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').unique().notNull(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    nameIdx: index('idx_rooms_name').on(table.name),
    creatorIdx: index('idx_rooms_creator_id').on(table.creatorId),
    roomNameLengthCheck: check(
      'rooms_name_length_check',
      sql`char_length(${table.name}) between 3 and 32`,
    ),
    roomNameFormatCheck: check(
      'rooms_name_format_check',
      sql`${table.name} ~ '^[A-Za-z0-9-]+$'`,
    ),
  }),
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    roomCreatedIdx: index('idx_messages_room_created_id').on(
      table.roomId,
      table.createdAt,
      table.id,
    ),
    userIdx: index('idx_messages_user_id').on(table.userId),
    messageContentLengthCheck: check(
      'messages_content_length_check',
      sql`char_length(btrim(${table.content})) between 1 and 1000`,
    ),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
