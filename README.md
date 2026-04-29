# Chat API

Production-ready real-time group chat backend built with NestJS, PostgreSQL, Drizzle ORM, Redis, and Socket.IO.

## Stack

- NestJS
- PostgreSQL
- Drizzle ORM
- Redis
- Socket.IO
- Swagger

## Features

- Username-only authentication with opaque Redis-backed sessions
- Room creation, listing, lookup, and creator-only deletion
- Persistent room messages with cursor pagination
- Real-time message delivery through WebSocket namespace `/chat`
- Redis pub/sub fan-out for multi-instance deployments
- Global validation, strict response envelope, Swagger docs, and deployment assets

## Folder Structure

```text
.
|- src
|  |- auth
|  |- common
|  |- config
|  |- database
|  |- messages
|  |- redis
|  |- rooms
|  |- users
|  `- websocket
|- supabase/migrations
|- test
|- .env.example
|- ARCHITECTURE.md
|- Dockerfile
`- render.yaml
```

## Environment

Copy `.env.example` to `.env` and fill in real values:

```env
PORT=3000
NODE_ENV=development

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chat_api
DATABASE_SSL=false
DATABASE_POOL_MAX=10

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

SESSION_TTL_SECONDS=86400
CORS_ORIGIN=http://localhost:3001
```

## Setup

```bash
npm install
npm run db:push
npm run start:dev
```

If you prefer SQL migrations instead of `db:push`, run `npm run db:generate` and apply the generated files from `supabase/migrations`.

Swagger will be available at `http://localhost:3000/api/docs`.

## Scripts

```bash
npm run build
npm run start:dev
npm run start:prod
npm run test
npm run test:e2e
npm run db:generate
npm run db:push
npm run db:studio
```

## API Overview

Base path: `/api/v1`

### Auth

- `POST /login`

Request:

```json
{
  "username": "alice_01"
}
```

### Rooms

- `GET /rooms`
- `POST /rooms`
- `GET /rooms/:id`
- `DELETE /rooms/:id`

### Messages

- `GET /rooms/:id/messages?limit=50&before=<cursor>`
- `POST /rooms/:id/messages`

## WebSocket

Namespace: `/chat`

Connect with:

```text
/chat?token=<sessionToken>&roomId=<roomId>
```

### Server Events

- `room:joined`
- `room:user_joined`
- `message:new`
- `room:user_left`
- `room:deleted`

### Client Event

- `room:leave`

## Response Contract

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "SNAKE_CASE_ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

## Deployment

### Render

- `render.yaml` is included for a web service deployment.
- Set managed PostgreSQL and Redis connection values as environment variables.
- Build command: `npm install && npm run build`
- Start command: `npm run start:prod`

### Railway

- Use the included `Dockerfile` or standard Node build/start commands.
- Provision PostgreSQL and Redis plugins.
- Set `NODE_ENV=production` and `DATABASE_SSL=true` when your provider requires TLS.

## Architecture Notes

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module boundaries, request flow, Redis pub/sub flow, and scaling behavior.
