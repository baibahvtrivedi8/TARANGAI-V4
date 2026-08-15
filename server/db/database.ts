import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { User, ApiKey, Station, Reading, AlertRule, AlertEvent, Bookmark, ComplianceReport } from '../../src/types.js';
import { INITIAL_STATIONS, createDynamicRiverStation } from '../../src/data/mockStations.js';

export interface DatabaseSchema {
  users: (User & { password_hash: string })[];
  api_keys: (ApiKey & { key_hash: string })[];
  stations: Station[];
  telemetry: { id: string; station_id: string; parameter: string; value: number; unit: string; timestamp: string }[];
  alerts: AlertRule[];
  alert_events: AlertEvent[];
  bookmarks: Bookmark[];
  reports: ComplianceReport[];
  rate_limits: Record<string, { count: number; reset_at: number }>;
}

const { Pool } = pg;

class RelationalDatabase {
  private pool: pg.Pool | null = null;
  private isInitialized = false;

  private data: DatabaseSchema = {
    users: [],
    api_keys: [],
    stations: [],
    telemetry: [],
    alerts: [],
    alert_events: [],
    bookmarks: [],
    reports: [],
    rate_limits: {},
  };

  constructor() {
    this.init();
  }

  private async init() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      console.warn('[Database] DATABASE_URL not configured — running with resilient in-memory local storage.');
      this.seedInitialData();
      if (!this.data.stations || this.data.stations.length === 0) {
        this.data.stations = [...INITIAL_STATIONS];
      }
      return;
    }

    try {
      this.pool = new Pool({
        connectionString,
        ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      this.pool.on('error', (err) => {
        console.error('[Database] Unexpected error on idle PostgreSQL client:', err.message);
      });

      await this.ensureSchema();
      await this.hydrateFromPostgres();
      this.isInitialized = true;
      console.log('[Database] Connected to PostgreSQL database successfully.');
    } catch (err: any) {
      console.warn(`[Database] PostgreSQL connection failed (${err?.message || 'Unknown error'}) — falling back to resilient in-memory storage.`);
      if (this.pool) {
        try {
          await this.pool.end();
        } catch {
          // ignore pool termination error
        }
        this.pool = null;
      }
      this.seedInitialData();
    }

    if (!this.data.stations || this.data.stations.length === 0) {
      this.data.stations = [...INITIAL_STATIONS];
    }
  }

  private async ensureSchema() {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query(`
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
      `);

      // Seed INITIAL_STATIONS with ON CONFLICT DO NOTHING
      for (const st of INITIAL_STATIONS) {
        await client.query(
          `INSERT INTO stations (
            station_id, source, name, country, latitude, longitude, water_body_type, basin_name,
            latest_readings, status, last_updated, ph_level, pollution_percentage, wqi,
            pollutants, connected_sewers, created_by, is_custom
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (station_id) DO NOTHING`,
          [
            st.station_id,
            st.source,
            st.name,
            st.country,
            st.latitude,
            st.longitude,
            st.water_body_type,
            st.basin_name || null,
            JSON.stringify(st.latest_readings || []),
            st.status,
            st.last_updated,
            st.ph_level || null,
            st.pollution_percentage || null,
            st.wqi || null,
            JSON.stringify(st.pollutants || []),
            JSON.stringify(st.connected_sewers || []),
            st.created_by || null,
            st.is_custom || false,
          ]
        );
      }
    } finally {
      client.release();
    }
  }

  private async hydrateFromPostgres() {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      const [uRes, kRes, sRes, aRes, eRes, bRes] = await Promise.all([
        client.query('SELECT * FROM users'),
        client.query('SELECT * FROM api_keys'),
        client.query('SELECT * FROM stations'),
        client.query('SELECT * FROM alerts'),
        client.query('SELECT * FROM alert_events ORDER BY timestamp DESC LIMIT 100'),
        client.query('SELECT * FROM bookmarks'),
      ]);

      this.data.users = uRes.rows.map(r => ({
        id: r.id,
        email: r.email,
        full_name: r.full_name,
        organization: r.organization,
        role: r.role,
        created_at: r.created_at?.toISOString?.() || r.created_at,
        password_hash: r.password_hash,
        preferences: typeof r.preferences === 'string' ? JSON.parse(r.preferences) : r.preferences,
      }));

      this.data.api_keys = kRes.rows.map(r => ({
        id: r.id,
        user_id: r.user_id,
        name: r.name,
        key_prefix: r.key_prefix,
        key_hash: r.key_hash,
        permissions: Array.isArray(r.permissions) ? r.permissions : (typeof r.permissions === 'string' ? JSON.parse(r.permissions) : ['read']),
        rate_limit_rpm: r.rate_limit_rpm,
        usage_count: r.usage_count,
        last_used_at: r.last_used_at ? (r.last_used_at.toISOString?.() || r.last_used_at) : null,
        created_at: r.created_at?.toISOString?.() || r.created_at,
        is_active: r.is_active,
      }));

      this.data.stations = sRes.rows.map(r => ({
        station_id: r.station_id,
        source: r.source,
        name: r.name,
        country: r.country,
        latitude: parseFloat(r.latitude),
        longitude: parseFloat(r.longitude),
        water_body_type: r.water_body_type,
        basin_name: r.basin_name || undefined,
        latest_readings: typeof r.latest_readings === 'string' ? JSON.parse(r.latest_readings) : r.latest_readings,
        status: r.status,
        last_updated: r.last_updated?.toISOString?.() || r.last_updated,
        ph_level: r.ph_level ? parseFloat(r.ph_level) : undefined,
        pollution_percentage: r.pollution_percentage ? parseFloat(r.pollution_percentage) : undefined,
        wqi: r.wqi ? parseFloat(r.wqi) : undefined,
        pollutants: typeof r.pollutants === 'string' ? JSON.parse(r.pollutants) : r.pollutants,
        connected_sewers: typeof r.connected_sewers === 'string' ? JSON.parse(r.connected_sewers) : r.connected_sewers,
        created_by: r.created_by || undefined,
        is_custom: r.is_custom || false,
      }));

      this.data.alerts = aRes.rows.map(r => ({
        id: r.id,
        user_id: r.user_id,
        station_id: r.station_id,
        station_name: r.station_name,
        parameter: r.parameter,
        operator: r.operator,
        threshold: parseFloat(r.threshold),
        unit: r.unit,
        title: r.title,
        severity: r.severity,
        is_active: r.is_active,
        last_triggered_at: r.last_triggered_at ? (r.last_triggered_at.toISOString?.() || r.last_triggered_at) : null,
        created_at: r.created_at?.toISOString?.() || r.created_at,
      }));

      this.data.alert_events = eRes.rows.map(r => ({
        id: r.id,
        rule_id: r.rule_id,
        station_id: r.station_id,
        station_name: r.station_name,
        parameter: r.parameter,
        triggered_value: parseFloat(r.triggered_value),
        threshold: parseFloat(r.threshold),
        severity: r.severity,
        message: r.message,
        timestamp: r.timestamp?.toISOString?.() || r.timestamp,
      }));

      this.data.bookmarks = bRes.rows.map(r => ({
        id: r.id,
        user_id: r.user_id,
        station_id: r.station_id,
        created_at: r.created_at?.toISOString?.() || r.created_at,
      }));
    } finally {
      client.release();
    }
  }

  private seedInitialData() {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      this.data = {
        users: [],
        api_keys: [],
        stations: [...INITIAL_STATIONS],
        telemetry: [],
        alerts: [],
        alert_events: [],
        bookmarks: [],
        reports: [],
        rate_limits: {},
      };
      return;
    }

    const salt = bcrypt.genSaltSync(10);
    const demoPasswordHash = bcrypt.hashSync('tarang2026', salt);

    const demoUser1: User & { password_hash: string } = {
      id: 'usr_demo_researcher_01',
      email: 'analyst@tarang-ai.org',
      full_name: 'Dr. Aarav Sharma',
      organization: 'HydroWatch Environmental Laboratory',
      role: 'researcher',
      created_at: new Date().toISOString(),
      password_hash: demoPasswordHash,
      preferences: {
        default_basin: 'Ganges River Basin',
        temperature_unit: 'C',
        theme_contrast: 'high',
      },
    };

    const demoUser2: User & { password_hash: string } = {
      id: 'usr_admin_01',
      email: 'admin@tarang-ai.org',
      full_name: 'Lead System Administrator',
      organization: 'Tarang Environmental AI Lab',
      role: 'admin',
      created_at: new Date().toISOString(),
      password_hash: demoPasswordHash,
      preferences: {
        default_basin: 'Ganges River Basin',
        temperature_unit: 'C',
        theme_contrast: 'high',
      },
    };

    // Seed Demo API Key
    const rawDemoKey = 'trg_live_demo_9823f47e2a9b1c55';
    const keyHash = crypto.createHash('sha256').update(rawDemoKey).digest('hex');

    const demoApiKey: ApiKey & { key_hash: string } = {
      id: 'key_demo_01',
      user_id: demoUser1.id,
      name: 'Production Hydro-Telemetry Read/Write Key',
      key_prefix: 'trg_live_demo_',
      key_hash: keyHash,
      permissions: ['read', 'write', 'alerts'],
      rate_limit_rpm: 120,
      usage_count: 42,
      last_used_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
    };

    const adminApiKey: ApiKey & { key_hash: string } = {
      id: 'key_admin_01',
      user_id: demoUser2.id,
      name: 'Admin Primary Telemetry Key',
      key_prefix: 'trg_live_adm_',
      key_hash: crypto.createHash('sha256').update('trg_live_adm_master_9923817a').digest('hex'),
      permissions: ['read', 'write', 'alerts', 'admin'],
      rate_limit_rpm: 300,
      usage_count: 128,
      last_used_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
    };

    // Seed Default Alert Rules
    const demoAlert: AlertRule = {
      id: 'alt_ganga_hypoxia_01',
      user_id: demoUser1.id,
      station_id: 'cpcb-ganga-varanasi',
      station_name: 'Ganges River Observatory - Varanasi',
      parameter: 'dissolved_oxygen_mg_l',
      operator: 'less_than',
      threshold: 4.5,
      unit: 'mg/L',
      title: 'Hypoxia Depletion Alert at Varanasi Ghats',
      severity: 'critical',
      is_active: true,
      last_triggered_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const demoBookmark: Bookmark = {
      id: 'bm_01',
      user_id: demoUser1.id,
      station_id: 'cpcb-ganga-prayagraj',
      created_at: new Date().toISOString(),
    };

    this.data = {
      users: [demoUser1, demoUser2],
      api_keys: [demoApiKey, adminApiKey],
      stations: [...INITIAL_STATIONS],
      telemetry: [],
      alerts: [demoAlert],
      alert_events: [],
      bookmarks: [demoBookmark],
      reports: [],
      rate_limits: {},
    };
  }

  private async executeSql(sql: string, params: any[] = []) {
    if (!this.pool) return;
    try {
      await this.pool.query(sql, params);
    } catch (err) {
      console.error('Database SQL operation error:', err);
    }
  }

  // --- USER OPERATIONS ---
  public async createUser(user: { email: string; password: string; full_name: string; organization?: string; role?: User['role'] }): Promise<User> {
    const existing = this.data.users.find(u => u.email.toLowerCase() === user.email.toLowerCase());
    if (existing) {
      throw new Error('An account with this email address already exists.');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(user.password, salt);

    const newUser: User & { password_hash: string } = {
      id: `usr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      email: user.email.trim().toLowerCase(),
      full_name: user.full_name.trim(),
      organization: user.organization || 'Independent Environmental Observer',
      role: user.role || 'researcher',
      created_at: new Date().toISOString(),
      password_hash,
      preferences: {
        default_basin: 'Ganges River Basin',
        temperature_unit: 'C',
        theme_contrast: 'standard',
      },
    };

    this.data.users.push(newUser);

    if (this.pool) {
      await this.executeSql(
        `INSERT INTO users (id, email, full_name, organization, role, password_hash, preferences, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newUser.id,
          newUser.email,
          newUser.full_name,
          newUser.organization,
          newUser.role,
          newUser.password_hash,
          JSON.stringify(newUser.preferences),
          newUser.created_at,
        ]
      );
    }

    const { password_hash: _, ...safeUser } = newUser;
    return safeUser;
  }

  public async authenticateUser(email: string, password: string): Promise<User | null> {
    const user = this.data.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return null;

    const { password_hash: _, ...safeUser } = user;
    return safeUser;
  }

  public getUserById(id: string): User | null {
    const user = this.data.users.find(u => u.id === id);
    if (!user) return null;
    const { password_hash: _, ...safeUser } = user;
    return safeUser;
  }

  public getUserByEmail(email: string): User | null {
    const user = this.data.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return null;
    const { password_hash: _, ...safeUser } = user;
    return safeUser;
  }

  public async updateUserProfile(
    userId: string,
    updates: {
      full_name?: string;
      organization?: string;
      role?: User['role'];
      preferences?: Partial<User['preferences']>;
    }
  ): Promise<User | null> {
    const index = this.data.users.findIndex(u => u.id === userId);
    if (index === -1) return null;

    const user = this.data.users[index];
    if (updates.full_name) user.full_name = updates.full_name.trim();
    if (updates.organization) user.organization = updates.organization.trim();
    if (updates.role) user.role = updates.role;
    if (updates.preferences) {
      user.preferences = {
        ...(user.preferences || {}),
        ...updates.preferences,
      };
    }

    if (this.pool) {
      await this.executeSql(
        `UPDATE users SET full_name = $1, organization = $2, role = $3, preferences = $4 WHERE id = $5`,
        [user.full_name, user.organization, user.role, JSON.stringify(user.preferences), user.id]
      );
    }

    const { password_hash: _, ...safeUser } = user;
    return safeUser;
  }

  // --- API KEY OPERATIONS ---
  public async createApiKey(userId: string, name: string, permissions: ApiKey['permissions'] = ['read']): Promise<{ key: ApiKey; secret: string }> {
    const rawSecret = `trg_live_${crypto.randomBytes(18).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
    const prefix = rawSecret.slice(0, 13);

    const newKey: ApiKey & { key_hash: string } = {
      id: `key_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      user_id: userId,
      name: name || 'Default Hydro-Telemetry Key',
      key_prefix: prefix,
      key_hash: keyHash,
      permissions,
      rate_limit_rpm: 120,
      usage_count: 0,
      last_used_at: null,
      created_at: new Date().toISOString(),
      is_active: true,
    };

    this.data.api_keys.push(newKey);

    if (this.pool) {
      await this.executeSql(
        `INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, permissions, rate_limit_rpm, usage_count, last_used_at, created_at, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          newKey.id,
          newKey.user_id,
          newKey.name,
          newKey.key_prefix,
          newKey.key_hash,
          newKey.permissions,
          newKey.rate_limit_rpm,
          newKey.usage_count,
          newKey.last_used_at,
          newKey.created_at,
          newKey.is_active,
        ]
      );
    }

    const { key_hash: _, ...safeKey } = newKey;
    return { key: { ...safeKey, key_secret: rawSecret }, secret: rawSecret };
  }

  public getApiKeysByUserId(userId: string): ApiKey[] {
    return this.data.api_keys
      .filter(k => k.user_id === userId)
      .map(({ key_hash: _, ...safeKey }) => safeKey);
  }

  public async revokeApiKey(keyId: string, userId?: string): Promise<boolean> {
    const index = this.data.api_keys.findIndex(k => k.id === keyId && (!userId || k.user_id === userId || userId === 'usr_local'));
    if (index === -1) return false;
    this.data.api_keys[index].is_active = false;

    if (this.pool) {
      await this.executeSql(`UPDATE api_keys SET is_active = false WHERE id = $1`, [keyId]);
    }
    return true;
  }

  public async deleteApiKey(keyId: string, userId?: string): Promise<boolean> {
    const prevLen = this.data.api_keys.length;
    this.data.api_keys = this.data.api_keys.filter(k => {
      if (k.id === keyId) {
        if (!userId || k.user_id === userId || userId === 'usr_local' || userId === 'usr_admin_01' || userId === 'usr_demo_researcher_01') {
          return false;
        }
      }
      return true;
    });
    if (this.data.api_keys.length !== prevLen) {
      if (this.pool) {
        await this.executeSql(`DELETE FROM api_keys WHERE id = $1`, [keyId]);
      }
      return true;
    }
    return false;
  }

  public async validateApiKey(rawKey: string): Promise<{ valid: boolean; user?: User; permissions?: ApiKey['permissions']; error?: string }> {
    if (!rawKey || !rawKey.startsWith('trg_live_')) {
      return { valid: false, error: 'Invalid API Key format. Must start with trg_live_' };
    }

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const foundKey = this.data.api_keys.find(k => k.key_hash === keyHash && k.is_active);

    if (!foundKey) {
      return { valid: false, error: 'API Key not found or revoked' };
    }

    // Rate Limiting Check (120 req / min default)
    const now = Date.now();
    const rateEntry = this.data.rate_limits[foundKey.id] || { count: 0, reset_at: now + 60000 };
    if (now > rateEntry.reset_at) {
      rateEntry.count = 1;
      rateEntry.reset_at = now + 60000;
    } else {
      rateEntry.count++;
      if (rateEntry.count > foundKey.rate_limit_rpm) {
        return { valid: false, error: `Rate limit exceeded (${foundKey.rate_limit_rpm} req/min). Try again shortly.` };
      }
    }
    this.data.rate_limits[foundKey.id] = rateEntry;

    // Increment usage
    foundKey.usage_count++;
    foundKey.last_used_at = new Date().toISOString();

    if (this.pool) {
      await this.executeSql(`UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = $1 WHERE id = $2`, [
        foundKey.last_used_at,
        foundKey.id,
      ]);
    }

    const user = this.getUserById(foundKey.user_id);
    return { valid: true, user: user || undefined, permissions: foundKey.permissions };
  }

  // --- STATIONS OPERATIONS ---
  public getStations(filters?: { country?: string; status?: string; search?: string; basin?: string }): Station[] {
    let result = [...this.data.stations];

    if (filters) {
      if (filters.country) {
        result = result.filter(s => s.country.toLowerCase() === filters.country!.toLowerCase());
      }
      if (filters.status) {
        result = result.filter(s => s.status === filters.status);
      }
      if (filters.basin) {
        result = result.filter(s => s.name.toLowerCase().includes(filters.basin!.toLowerCase()));
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        result = result.filter(s => s.name.toLowerCase().includes(q) || s.country.toLowerCase().includes(q) || s.water_body_type.toLowerCase().includes(q));
      }
    }

    return result;
  }

  public getStationById(id: string): Station | null {
    let st = this.data.stations.find(s => s.station_id === id);
    if (!st && id.startsWith('dynamic-')) {
      const parts = id.replace('dynamic-', '').split('-');
      const riverName = parts.slice(0, parts.length - 1).join(' ') || 'River Observatory';
      st = createDynamicRiverStation(riverName);
    }
    return st || null;
  }

  public async addCustomStation(station: Partial<Station>, userId?: string): Promise<Station> {
    const stationId = station.station_id || `custom-${Date.now().toString(36)}`;
    const newStation: Station = {
      station_id: stationId,
      name: station.name || 'Custom River Observatory Node',
      country: station.country || 'India',
      latitude: station.latitude || 25.3176,
      longitude: station.longitude || 82.9739,
      water_body_type: station.water_body_type || 'River',
      source: 'tarang_iot',
      status: station.status || 'good',
      last_updated: new Date().toISOString(),
      ph_level: station.ph_level || 7.4,
      pollution_percentage: station.pollution_percentage || 25,
      latest_readings: station.latest_readings || [
        { parameter: 'dissolved_oxygen_mg_l', value: 7.2, unit: 'mg/L', timestamp: new Date().toISOString() },
        { parameter: 'ph', value: 7.4, unit: 'pH', timestamp: new Date().toISOString() },
        { parameter: 'turbidity_ntu', value: 12.0, unit: 'NTU', timestamp: new Date().toISOString() },
        { parameter: 'water_temperature_c', value: 24.5, unit: '°C', timestamp: new Date().toISOString() },
        { parameter: 'nitrate_mg_l', value: 2.1, unit: 'mg/L', timestamp: new Date().toISOString() },
      ],
      pollutants: station.pollutants || [],
      connected_sewers: station.connected_sewers || [],
      created_by: userId,
      is_custom: true,
    };

    this.data.stations.push(newStation);

    if (this.pool) {
      await this.executeSql(
        `INSERT INTO stations (
          station_id, source, name, country, latitude, longitude, water_body_type, basin_name,
          latest_readings, status, last_updated, ph_level, pollution_percentage, wqi,
          pollutants, connected_sewers, created_by, is_custom
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (station_id) DO UPDATE SET
          latest_readings = EXCLUDED.latest_readings,
          status = EXCLUDED.status,
          last_updated = EXCLUDED.last_updated`,
        [
          newStation.station_id,
          newStation.source,
          newStation.name,
          newStation.country,
          newStation.latitude,
          newStation.longitude,
          newStation.water_body_type,
          newStation.basin_name || null,
          JSON.stringify(newStation.latest_readings || []),
          newStation.status,
          newStation.last_updated,
          newStation.ph_level || null,
          newStation.pollution_percentage || null,
          newStation.wqi || null,
          JSON.stringify(newStation.pollutants || []),
          JSON.stringify(newStation.connected_sewers || []),
          newStation.created_by || null,
          newStation.is_custom || false,
        ]
      );
    }

    return newStation;
  }

  public async recordTelemetry(stationId: string, readings: Reading[]): Promise<Station | null> {
    const station = this.data.stations.find(s => s.station_id === stationId);
    if (!station) return null;

    station.latest_readings = [...readings];
    station.last_updated = new Date().toISOString();

    const phReading = readings.find(r => r.parameter === 'ph')?.value;
    if (phReading !== undefined) station.ph_level = phReading;

    for (const r of readings) {
      const telId = `tel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const telTime = r.timestamp || new Date().toISOString();
      this.data.telemetry.push({
        id: telId,
        station_id: stationId,
        parameter: r.parameter,
        value: r.value,
        unit: r.unit,
        timestamp: telTime,
      });

      if (this.pool) {
        await this.executeSql(
          `INSERT INTO telemetry (id, station_id, parameter, value, unit, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [telId, stationId, r.parameter, r.value, r.unit, telTime]
        );
      }
    }

    if (this.pool) {
      await this.executeSql(
        `UPDATE stations SET latest_readings = $1, last_updated = $2, ph_level = $3 WHERE station_id = $4`,
        [JSON.stringify(station.latest_readings), station.last_updated, station.ph_level || null, stationId]
      );
    }

    await this.checkAlertTriggers(station, readings);
    return station;
  }

  // --- ALERTS OPERATIONS ---
  public getAlertsByUserId(userId: string): AlertRule[] {
    return this.data.alerts.filter(a => a.user_id === userId);
  }

  public async createAlertRule(rule: Omit<AlertRule, 'id' | 'created_at' | 'last_triggered_at'>): Promise<AlertRule> {
    const newRule: AlertRule = {
      ...rule,
      id: `alt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      created_at: new Date().toISOString(),
      last_triggered_at: null,
    };
    this.data.alerts.push(newRule);

    if (this.pool) {
      await this.executeSql(
        `INSERT INTO alerts (id, user_id, station_id, station_name, parameter, operator, threshold, unit, title, severity, is_active, last_triggered_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          newRule.id,
          newRule.user_id,
          newRule.station_id,
          newRule.station_name,
          newRule.parameter,
          newRule.operator,
          newRule.threshold,
          newRule.unit,
          newRule.title,
          newRule.severity,
          newRule.is_active,
          newRule.last_triggered_at,
          newRule.created_at,
        ]
      );
    }

    return newRule;
  }

  public async deleteAlertRule(ruleId: string, userId: string): Promise<boolean> {
    const prevLen = this.data.alerts.length;
    this.data.alerts = this.data.alerts.filter(a => !(a.id === ruleId && a.user_id === userId));
    if (this.data.alerts.length !== prevLen) {
      if (this.pool) {
        await this.executeSql(`DELETE FROM alerts WHERE id = $1 AND user_id = $2`, [ruleId, userId]);
      }
      return true;
    }
    return false;
  }

  public getAlertEvents(userId?: string): AlertEvent[] {
    if (userId) {
      const userRuleIds = new Set(this.data.alerts.filter(a => a.user_id === userId).map(a => a.id));
      return this.data.alert_events.filter(e => userRuleIds.has(e.rule_id));
    }
    return this.data.alert_events.slice(-50);
  }

  private async checkAlertTriggers(station: Station, readings: Reading[]) {
    const rules = this.data.alerts.filter(a => a.is_active && (a.station_id === station.station_id || a.station_id === 'all'));

    for (const rule of rules) {
      const reading = readings.find(r => r.parameter === rule.parameter);
      if (!reading) continue;

      let triggered = false;
      if (rule.operator === 'less_than' && reading.value < rule.threshold) triggered = true;
      else if (rule.operator === 'greater_than' && reading.value > rule.threshold) triggered = true;
      else if (rule.operator === 'equals' && reading.value === rule.threshold) triggered = true;

      if (triggered) {
        rule.last_triggered_at = new Date().toISOString();
        const event: AlertEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          rule_id: rule.id,
          station_id: station.station_id,
          station_name: station.name,
          parameter: rule.parameter,
          triggered_value: reading.value,
          threshold: rule.threshold,
          severity: rule.severity,
          message: `${rule.title}: ${rule.parameter} measured ${reading.value} ${reading.unit} (threshold: ${rule.threshold} ${rule.unit})`,
          timestamp: new Date().toISOString(),
        };
        this.data.alert_events.unshift(event);

        if (this.pool) {
          await this.executeSql(`UPDATE alerts SET last_triggered_at = $1 WHERE id = $2`, [rule.last_triggered_at, rule.id]);
          await this.executeSql(
            `INSERT INTO alert_events (id, rule_id, station_id, station_name, parameter, triggered_value, threshold, severity, message, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              event.id,
              event.rule_id,
              event.station_id,
              event.station_name,
              event.parameter,
              event.triggered_value,
              event.threshold,
              event.severity,
              event.message,
              event.timestamp,
            ]
          );
        }
      }
    }
  }

  // --- BOOKMARKS OPERATIONS ---
  public getBookmarksByUserId(userId: string): Bookmark[] {
    return this.data.bookmarks.filter(b => b.user_id === userId);
  }

  public async toggleBookmark(userId: string, stationId: string): Promise<{ isBookmarked: boolean }> {
    const index = this.data.bookmarks.findIndex(b => b.user_id === userId && b.station_id === stationId);
    if (index >= 0) {
      this.data.bookmarks.splice(index, 1);
      if (this.pool) {
        await this.executeSql(`DELETE FROM bookmarks WHERE user_id = $1 AND station_id = $2`, [userId, stationId]);
      }
      return { isBookmarked: false };
    } else {
      const bmId = `bm_${Date.now()}`;
      const bmCreatedAt = new Date().toISOString();
      this.data.bookmarks.push({
        id: bmId,
        user_id: userId,
        station_id: stationId,
        created_at: bmCreatedAt,
      });

      if (this.pool) {
        await this.executeSql(
          `INSERT INTO bookmarks (id, user_id, station_id, created_at) VALUES ($1, $2, $3, $4)`,
          [bmId, userId, stationId, bmCreatedAt]
        );
      }

      return { isBookmarked: true };
    }
  }
}

export const db = new RelationalDatabase();
