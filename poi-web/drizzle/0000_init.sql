CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  name VARCHAR(100) NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pois (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  province VARCHAR(100),
  address TEXT,
  category VARCHAR(100),
  batch VARCHAR(100),
  age VARCHAR(255),
  heritage_code BIGINT,
  class_code INTEGER,
  location GEOMETRY(Point, 4326) NOT NULL,
  image_url TEXT,
  website TEXT,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pois_location ON pois USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_pois_name ON pois USING btree (name);
CREATE INDEX IF NOT EXISTS idx_pois_category ON pois USING btree (category);
CREATE INDEX IF NOT EXISTS idx_pois_province ON pois USING btree (province);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);
