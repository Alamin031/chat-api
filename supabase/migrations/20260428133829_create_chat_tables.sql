CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT users_username_length_check CHECK (char_length(username) BETWEEN 2 AND 24),
  CONSTRAINT users_username_format_check CHECK (username ~ '^[A-Za-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT rooms_name_length_check CHECK (char_length(name) BETWEEN 3 AND 32),
  CONSTRAINT rooms_name_format_check CHECK (name ~ '^[A-Za-z0-9-]+$')
);

CREATE INDEX IF NOT EXISTS idx_rooms_name ON rooms(name);
CREATE INDEX IF NOT EXISTS idx_rooms_creator_id ON rooms(creator_id);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT messages_content_length_check CHECK (char_length(btrim(content)) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created_id ON messages(room_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
