-- TARANG AI PostgreSQL Schema
-- Defines all relational database tables for hydrological telemetry, users, stations, and alert systems.

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  organization VARCHAR(255),
  role VARCHAR(32) NOT NULL DEFAULT 'researcher',
  password_hash TEXT NOT NULL,
  preferences JSONB DEFAULT '{"default_basin":"Ganges River Basin","temperature_unit":"C","theme_contrast":"standard"}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(32) NOT NULL,
  key_hash VARCHAR(128) NOT NULL UNIQUE,
  permissions TEXT[] NOT NULL DEFAULT '{"read"}',
  rate_limit_rpm INT NOT NULL DEFAULT 120,
  usage_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS stations (
  station_id VARCHAR(128) PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'tarang_iot',
  name VARCHAR(255) NOT NULL,
  country VARCHAR(128) NOT NULL,
  latitude NUMERIC(10, 6) NOT NULL,
  longitude NUMERIC(10, 6) NOT NULL,
  water_body_type VARCHAR(128) NOT NULL,
  basin_name VARCHAR(255),
  latest_readings JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'good',
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ph_level NUMERIC(5, 2),
  pollution_percentage NUMERIC(5, 2),
  wqi NUMERIC(6, 2),
  pollutants JSONB DEFAULT '[]'::jsonb,
  connected_sewers JSONB DEFAULT '[]'::jsonb,
  created_by VARCHAR(64),
  is_custom BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS telemetry (
  id VARCHAR(64) PRIMARY KEY,
  station_id VARCHAR(128) REFERENCES stations(station_id) ON DELETE CASCADE,
  parameter VARCHAR(128) NOT NULL,
  value NUMERIC(12, 4) NOT NULL,
  unit VARCHAR(32) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
  station_id VARCHAR(128) NOT NULL,
  station_name VARCHAR(255) NOT NULL,
  parameter VARCHAR(128) NOT NULL,
  operator VARCHAR(32) NOT NULL,
  threshold NUMERIC(12, 4) NOT NULL,
  unit VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'warning',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alert_events (
  id VARCHAR(64) PRIMARY KEY,
  rule_id VARCHAR(64) REFERENCES alerts(id) ON DELETE CASCADE,
  station_id VARCHAR(128) NOT NULL,
  station_name VARCHAR(255) NOT NULL,
  parameter VARCHAR(128) NOT NULL,
  triggered_value NUMERIC(12, 4) NOT NULL,
  threshold NUMERIC(12, 4) NOT NULL,
  severity VARCHAR(32) NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
  station_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(64) PRIMARY KEY,
  station_id VARCHAR(128) NOT NULL,
  station_name VARCHAR(255) NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  evaluated_by VARCHAR(255) NOT NULL,
  wqi_score NUMERIC(6, 2) NOT NULL,
  who_compliance BOOLEAN NOT NULL,
  epa_compliance BOOLEAN NOT NULL,
  cpcb_class VARCHAR(32) NOT NULL,
  primary_exceedances JSONB DEFAULT '[]'::jsonb,
  remediation_steps JSONB DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key_id VARCHAR(128) PRIMARY KEY,
  count INT NOT NULL DEFAULT 0,
  reset_at BIGINT NOT NULL
);
