# Architecture

## Overview

This backend is organized as a modular NestJS application with a clear separation between HTTP transport, business logic, persistence, and real-time delivery.

The high-level flow is:

1. HTTP controllers validate input and delegate to services.
2. Services use Drizzle ORM for all PostgreSQL reads and writes.
3. Redis stores sessions, room presence, socket metadata, and pub/sub events.
4. The WebSocket gateway subscribes to Redis events and emits them to connected room sockets.

## Modules

### `auth`

- Owns `POST /api/v1/login`
- Creates or reuses a user by username
- Generates opaque session tokens
- Stores sessions in Redis with a 24-hour TTL

### `users`

- Encapsulates user lookup and creation
- Provides a single source of truth for user persistence

### `rooms`

- Owns room CRUD behavior
- Enforces room name validation and uniqueness
- Enforces creator-only room deletion
- Publishes `room:deleted` through Redis before deleting the row

### `messages`

- Owns room message persistence and cursor pagination
- Publishes `message:new` after a successful insert
- Does not emit directly to sockets

### `redis`

- Handles session storage
- Tracks active users per room using Redis sets plus per-user connection counters
- Tracks socket metadata for disconnect cleanup
- Publishes JSON payloads for cross-instance fan-out

### `websocket`

- Owns the `/chat` namespace
- Validates `token` and `roomId` during the Socket.IO handshake
- Emits the exact server event names required by the spec
- Subscribes to Redis pub/sub so every app instance can emit locally to its own sockets

## Scaling Model

This app supports horizontal scaling without direct controller-to-socket coupling.

### Message flow

1. A client calls `POST /api/v1/rooms/:id/messages`.
2. `MessagesService` inserts the row into PostgreSQL via Drizzle.
3. `MessagesService` publishes `message:new` through Redis.
4. Every app instance subscribed to Redis receives the event.
5. Each instance emits `message:new` to its local sockets in that room.

### Presence flow

1. A socket connects to `/chat?token=<token>&roomId=<roomId>`.
2. The gateway validates the Redis session token and room existence.
3. Redis increments a per-user room connection counter and updates the active-user set.
4. On first active connection for that user in the room, the app publishes `room:user_joined`.
5. On final disconnect for that user in the room, the app publishes `room:user_left`.

This design avoids undercounting when the same user opens multiple tabs.

## Data Model

### `users`

- `id` UUID primary key
- `username` unique
- `created_at` timestamp
- DB check constraints enforce username format and length

### `rooms`

- `id` UUID primary key
- `name` unique
- `creator_id` foreign key to `users`
- `created_at` timestamp
- DB check constraints enforce room name format and length

### `messages`

- `id` UUID primary key
- `room_id` foreign key to `rooms`
- `user_id` foreign key to `users`
- `content` text
- `created_at` timestamp
- DB check constraint enforces non-empty content up to 1000 chars
- Composite index supports room history pagination

## Error Handling

- All HTTP responses use a global response interceptor and global exception filter.
- Validation failures become the standard error envelope.
- Domain errors use application-specific snake_case codes.

## Production Defaults

- Global prefix: `/api/v1`
- Swagger: `/api/docs`
- CORS enabled
- Config loaded via `@nestjs/config`
- PostgreSQL pool management with graceful shutdown
- Redis clients with graceful shutdown
- Dockerfile included for container deployments

## Tradeoffs

- Redis pub/sub is used for real-time fan-out across instances as required.
- Message persistence and event publication are not wrapped in an outbox pattern. PostgreSQL remains the source of truth, and Redis is the delivery mechanism.
- If you need exactly-once event guarantees, the next production step would be an outbox worker or durable queue layer.
