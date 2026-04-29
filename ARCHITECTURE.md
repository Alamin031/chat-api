# Architecture

## Overview

This backend is organized as a modular NestJS application with a clear separation between HTTP transport, business logic, persistence, and real-time delivery.

The high-level flow is:

1. HTTP controllers validate input and delegate to services.
2. Services use Drizzle ORM for all PostgreSQL reads and writes.
3. Redis stores sessions, room presence, socket metadata, and pub/sub events.
4. The WebSocket gateway subscribes to Redis events and emits them to connected room sockets.

```text
                +---------------------------+
                |      Client / Frontend    |
                +-------------+-------------+
                              |
                REST (/api/v1)|WS (/chat)
                              |
                +-------------v-------------+
                |   NestJS App Instance N   |
                | Controllers / Services /  |
                | Socket.IO Gateway         |
                +------+------+-------------+
                       |      |
              PostgreSQL      Redis
          (users/rooms/messages) | sessions / presence / pub-sub
                                 |
                +----------------v-------------+
                |   NestJS App Instance N+1    |
                | Controllers / Services /     |
                | Socket.IO Gateway            |
                +------------------------------+
```

REST requests go through controllers into services and PostgreSQL. WebSocket connections are authenticated against Redis-backed sessions. After a message or room event is persisted or validated, Redis is used to fan that event out so every running app instance can notify its own connected sockets.

## Modules

### `auth`

- Owns `POST /api/v1/login`
- Creates or reuses a user by username
- Generates opaque session tokens
- Stores sessions in Redis with a 24-hour TTL

## Session Strategy

1. `POST /api/v1/login` looks up the username in PostgreSQL and creates it if it does not exist.
2. The server generates a 32-byte opaque random token using Node's crypto API.
3. Redis stores `session:<token> -> <userId>` with `EX 86400`, so sessions expire automatically after 24 hours.
4. Every authenticated REST request and every Socket.IO handshake resolves the token through Redis first, then loads the user from PostgreSQL.
5. Logging in again with the same username creates a fresh token without needing passwords or a separate registration step.

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

## Redis Fan-out

There are two Redis-based real-time layers in the app:

1. Application pub/sub channels (`message:new`, `room:user_joined`, `room:user_left`, `room:deleted`) carry domain events from REST/services to every app instance.
2. The Socket.IO Redis adapter shares room broadcasts and room membership awareness across instances, so a node can safely target a room even in a horizontally scaled deployment.

Flow example:

1. A client sends `POST /api/v1/rooms/:id/messages` to whichever NestJS instance the load balancer chose.
2. That instance stores the message in PostgreSQL.
3. The service publishes `message:new` to Redis.
4. Every NestJS instance subscribed to that channel receives the event.
5. Each instance emits the WebSocket event to its own local sockets in that room.
6. The Socket.IO Redis adapter keeps room targeting consistent across instances without relying on in-memory process state.

To avoid duplicate client events, Redis-delivered domain events are emitted with `server.local`, which prevents the application pub/sub layer and the Socket.IO Redis adapter from rebroadcasting the same event twice.

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

## Capacity Estimate

Estimated capacity on a single small-to-medium instance: roughly 2,000 to 5,000 concurrent socket connections, assuming:

- 2 to 4 vCPUs
- 4 to 8 GB RAM
- Managed PostgreSQL and Redis on separate services
- Chat usage dominated by short messages and room joins/leaves, not large payloads

Reasoning:

- The hot path is lightweight: Redis session lookup, Redis set/counter operations, and Socket.IO room broadcast.
- Message writes are small single-row PostgreSQL inserts plus one Redis publish.
- Memory pressure will usually be driven more by open socket count than by message payload size.
- CPU pressure will spike mainly on bursty fan-out or very high room activity, so the safe range depends heavily on room distribution.

I would validate the real limit with a k6/Artillery load test before treating this estimate as a production commitment.

## Scaling to 10x

To scale this system to roughly 10x the load, I would do the following in order:

1. Run multiple stateless NestJS instances behind a load balancer, keeping Redis and PostgreSQL managed separately.
2. Move from a single Redis node to a higher-throughput managed Redis plan or cluster, because presence tracking and pub/sub are both Redis-heavy.
3. Add read replicas or better pooling strategy for PostgreSQL if message-history reads become dominant.
4. Introduce an outbox or durable queue for message events if delivery guarantees need to be stronger than best-effort Redis pub/sub.
5. Add focused load tests, metrics, and dashboards for socket count, Redis latency, publish lag, DB latency, and per-room fan-out skew.
6. If a few rooms become extremely hot, shard by room activity pattern or move those rooms to a specialized streaming path.

## Known Limitations and Trade-offs

- Redis pub/sub is used for real-time fan-out across instances as required.
- Message persistence and event publication are not wrapped in an outbox pattern. PostgreSQL remains the source of truth, and Redis is the delivery mechanism.
- If you need exactly-once event guarantees, the next production step would be an outbox worker or durable queue layer.
- Active user lists are reconstructed from Redis user IDs plus PostgreSQL username lookups, which keeps connection state out of memory but adds extra reads on join/leave events.
- Room deletion publishes `room:deleted` before the database delete is executed, which matches the interview requirement but leaves a small window where the delete event could be emitted and the DB operation could still fail.
- The single-instance capacity estimate is an informed engineering estimate, not a benchmark result; a proper load test would still be required before production use.
