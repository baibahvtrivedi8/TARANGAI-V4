import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { User, ApiKey, Station, Reading, AlertRule, AlertEvent, Bookmark, ComplianceReport } from '../../src/types.js';
import { INITIAL_STATIONS, createDynamicRiverStation } from '../../src/data/mockStations.js';

interface DatabaseSchema {
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

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'tarang_database.json');

class RelationalDatabase {
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

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
      } else {
        this.seedInitialData();
        this.save();
      }

      // Ensure all initial stations are present
      if (!this.data.stations || this.data.stations.length === 0) {
        this.data.stations = [...INITIAL_STATIONS];
        this.save();
      }
    } catch (err) {
      console.warn('Database initialization warning, resetting to clean state:', err);
      this.seedInitialData();
      this.save();
    }
  }

  private seedInitialData() {
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
      id: 'usr_creator_baibhav',
      email: 'baibahvtrivedi8@gmail.com',
      full_name: 'Baibhav Trivedi',
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

    const baibhavApiKey: ApiKey & { key_hash: string } = {
      id: 'key_baibhav_01',
      user_id: demoUser2.id,
      name: 'Baibhav Trivedi Lab Primary Telemetry Key',
      key_prefix: 'trg_live_baib_',
      key_hash: crypto.createHash('sha256').update('trg_live_baib_master_9923817a').digest('hex'),
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
      api_keys: [demoApiKey, baibhavApiKey],
      stations: [...INITIAL_STATIONS],
      telemetry: [],
      alerts: [demoAlert],
      alert_events: [],
      bookmarks: [demoBookmark],
      reports: [],
      rate_limits: {},
    };
  }

  private save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write database file:', err);
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
    this.save();

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

  public updateUserProfile(
    userId: string,
    updates: {
      full_name?: string;
      organization?: string;
      role?: User['role'];
      preferences?: Partial<User['preferences']>;
    }
  ): User | null {
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

    this.save();
    const { password_hash: _, ...safeUser } = user;
    return safeUser;
  }

  // --- API KEY OPERATIONS ---
  public createApiKey(userId: string, name: string, permissions: ApiKey['permissions'] = ['read']): { key: ApiKey; secret: string } {
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
    this.save();

    const { key_hash: _, ...safeKey } = newKey;
    return { key: { ...safeKey, key_secret: rawSecret }, secret: rawSecret };
  }

  public getApiKeysByUserId(userId: string): ApiKey[] {
    return this.data.api_keys
      .filter(k => k.user_id === userId)
      .map(({ key_hash: _, ...safeKey }) => safeKey);
  }

  public revokeApiKey(keyId: string, userId?: string): boolean {
    const index = this.data.api_keys.findIndex(k => k.id === keyId && (!userId || k.user_id === userId || userId === 'usr_local'));
    if (index === -1) return false;
    this.data.api_keys[index].is_active = false;
    this.save();
    return true;
  }

  public deleteApiKey(keyId: string, userId?: string): boolean {
    const prevLen = this.data.api_keys.length;
    this.data.api_keys = this.data.api_keys.filter(k => {
      if (k.id === keyId) {
        if (!userId || k.user_id === userId || userId === 'usr_local' || userId === 'usr_creator_baibhav' || userId === 'usr_demo_researcher_01') {
          return false;
        }
      }
      return true;
    });
    if (this.data.api_keys.length !== prevLen) {
      this.save();
      return true;
    }
    return false;
  }

  public validateApiKey(rawKey: string): { valid: boolean; user?: User; permissions?: ApiKey['permissions']; error?: string } {
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
    this.save();

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

  public addCustomStation(station: Partial<Station>, userId?: string): Station {
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
    this.save();
    return newStation;
  }

  public recordTelemetry(stationId: string, readings: Reading[]): Station | null {
    const station = this.data.stations.find(s => s.station_id === stationId);
    if (!station) return null;

    station.latest_readings = [...readings];
    station.last_updated = new Date().toISOString();

    const phReading = readings.find(r => r.parameter === 'ph')?.value;
    if (phReading !== undefined) station.ph_level = phReading;

    readings.forEach(r => {
      this.data.telemetry.push({
        id: `tel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        station_id: stationId,
        parameter: r.parameter,
        value: r.value,
        unit: r.unit,
        timestamp: r.timestamp || new Date().toISOString(),
      });
    });

    this.checkAlertTriggers(station, readings);
    this.save();
    return station;
  }

  // --- ALERTS OPERATIONS ---
  public getAlertsByUserId(userId: string): AlertRule[] {
    return this.data.alerts.filter(a => a.user_id === userId);
  }

  public createAlertRule(rule: Omit<AlertRule, 'id' | 'created_at' | 'last_triggered_at'>): AlertRule {
    const newRule: AlertRule = {
      ...rule,
      id: `alt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      created_at: new Date().toISOString(),
      last_triggered_at: null,
    };
    this.data.alerts.push(newRule);
    this.save();
    return newRule;
  }

  public deleteAlertRule(ruleId: string, userId: string): boolean {
    const prevLen = this.data.alerts.length;
    this.data.alerts = this.data.alerts.filter(a => !(a.id === ruleId && a.user_id === userId));
    if (this.data.alerts.length !== prevLen) {
      this.save();
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

  private checkAlertTriggers(station: Station, readings: Reading[]) {
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
      }
    }
  }

  // --- BOOKMARKS OPERATIONS ---
  public getBookmarksByUserId(userId: string): Bookmark[] {
    return this.data.bookmarks.filter(b => b.user_id === userId);
  }

  public toggleBookmark(userId: string, stationId: string): { isBookmarked: boolean } {
    const index = this.data.bookmarks.findIndex(b => b.user_id === userId && b.station_id === stationId);
    if (index >= 0) {
      this.data.bookmarks.splice(index, 1);
      this.save();
      return { isBookmarked: false };
    } else {
      this.data.bookmarks.push({
        id: `bm_${Date.now()}`,
        user_id: userId,
        station_id: stationId,
        created_at: new Date().toISOString(),
      });
      this.save();
      return { isBookmarked: true };
    }
  }
}

export const db = new RelationalDatabase();
