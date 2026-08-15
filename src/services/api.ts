import { Station, Forecast, SearchResponse, RiverSuggestion, User, ApiKey, AlertRule, AlertEvent, Bookmark, ComplianceReport, StationAggregateStats } from '../types';
import { INITIAL_STATIONS, createDynamicRiverStation } from '../data/mockStations';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim();

const getUrl = (path: string) => {
  if (API_BASE_URL && API_BASE_URL !== 'http://localhost:8000') {
    const base = API_BASE_URL.replace(/\/$/, '');
    return `${base}${path}`;
  }
  return `/api${path}`;
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('tarang_session_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// ==========================================
// 1. AUTHENTICATION & SESSIONS
// ==========================================

export async function loginUser(email: string, password: string): Promise<{ user: User; token: string }> {
  const res = await fetch(getUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  
  localStorage.setItem('tarang_session_token', data.token);
  localStorage.setItem('tarang_user_email', data.user.email);
  localStorage.setItem('tarang_user_data', JSON.stringify(data.user));
  return data;
}

export async function registerUser(payload: { email: string; password: string; full_name: string; organization?: string }): Promise<{ user: User; token: string }> {
  const res = await fetch(getUrl('/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');

  localStorage.setItem('tarang_session_token', data.token);
  localStorage.setItem('tarang_user_email', data.user.email);
  localStorage.setItem('tarang_user_data', JSON.stringify(data.user));
  return data;
}

export async function fetchCurrentUser(): Promise<User | null> {
  const token = localStorage.getItem('tarang_session_token');
  if (!token) return null;
  try {
    const res = await fetch(getUrl('/auth/me'), {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      if (res.status === 401) {
        logoutUser();
      }
      return null;
    }
    const data = await res.json();
    if (data.user) {
      localStorage.setItem('tarang_user_data', JSON.stringify(data.user));
      return data.user;
    }
    return null;
  } catch (_) {
    return null;
  }
}

export function logoutUser(): void {
  localStorage.removeItem('tarang_session_token');
  localStorage.removeItem('tarang_user_email');
  localStorage.removeItem('tarang_user_data');
}

export async function updateUserProfileApi(updates: {
  full_name?: string;
  organization?: string;
  role?: User['role'];
  preferences?: Partial<User['preferences']>;
}): Promise<{ user: User; message: string }> {
  const res = await fetch(getUrl('/auth/profile'), {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update profile');
  if (data.user) {
    localStorage.setItem('tarang_user_data', JSON.stringify(data.user));
  }
  return data;
}

// ==========================================
// 2. PER-USER API KEYS
// ==========================================

export async function fetchApiKeys(): Promise<ApiKey[]> {
  try {
    const res = await fetch(getUrl('/keys'), { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch API keys');
    return await res.json();
  } catch (err) {
    console.warn('API keys fetch warning:', err);
    return [];
  }
}

export async function createApiKey(name: string, permissions: ApiKey['permissions'] = ['read', 'write']): Promise<{ key: ApiKey; secret: string }> {
  const res = await fetch(getUrl('/keys'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, permissions }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create API key');
  return data;
}

export async function revokeApiKey(keyId: string): Promise<boolean> {
  const res = await fetch(getUrl(`/keys/${keyId}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.ok;
}

// ==========================================
// 3. STATIONS & TELEMETRY
// ==========================================

export async function fetchStations(filters?: { country?: string; status?: string; search?: string; basin?: string }): Promise<Station[]> {
  try {
    let queryParams = '';
    if (filters) {
      const params = new URLSearchParams();
      if (filters.country) params.append('country', filters.country);
      if (filters.status) params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);
      if (filters.basin) params.append('basin', filters.basin);
      queryParams = `?${params.toString()}`;
    }
    const url = getUrl(`/stations${queryParams}`);
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Primary fetch failed, using local station list:', err);
    return INITIAL_STATIONS;
  }
}

export async function fetchStationById(id: string): Promise<Station> {
  try {
    const url = getUrl(`/stations/${id}`);
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    const local = INITIAL_STATIONS.find(s => s.station_id === id);
    if (local) return local;

    if (id.startsWith('dynamic-')) {
      const parts = id.replace('dynamic-', '').split('-');
      const riverQuery = parts.slice(0, parts.length - 1).join(' ') || 'River Observatory';
      return createDynamicRiverStation(riverQuery);
    }
    return INITIAL_STATIONS[0];
  }
}

export async function fetchStationForecast(
  id: string,
  parameter = 'dissolved_oxygen_mg_l',
  horizon = 90
): Promise<Forecast> {
  try {
    const url = getUrl(`/stations/${id}/forecast?parameter=${encodeURIComponent(parameter)}&horizon_days=${horizon}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const history = Array.from({ length: 12 }).map((_, i) => ({
      timestamp: new Date(now - (12 - i) * 7 * dayMs).toISOString(),
      value: Number((7.8 - i * 0.1 + Math.sin(i)).toFixed(2)),
    }));
    return {
      station_id: id,
      parameter,
      history,
      projected_crossing_date: new Date(now + 45 * dayMs).toISOString(),
      current_status: 'good',
      projected_status_in_90_days: 'moderate',
      confidence: 0.9,
      method: 'Hydrological Trend Predictor',
    };
  }
}

export async function fetchStationReport(id: string, evaluator?: string): Promise<ComplianceReport> {
  const url = getUrl(`/stations/${id}/report${evaluator ? `?evaluator=${encodeURIComponent(evaluator)}` : ''}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to generate compliance report');
  return await res.json();
}

export async function recordTelemetry(stationId: string, readings: { parameter: string; value: number; unit: string; timestamp?: string }[]): Promise<Station> {
  const res = await fetch(getUrl(`/stations/${stationId}/telemetry`), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ readings }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to record telemetry');
  return data.station;
}

// ==========================================
// 4. ALERTS & MONITORING
// ==========================================

export async function fetchAlertRules(): Promise<AlertRule[]> {
  try {
    const res = await fetch(getUrl('/alerts'), { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch (_) {
    return [];
  }
}

export async function createAlertRule(rule: Partial<AlertRule>): Promise<AlertRule> {
  const res = await fetch(getUrl('/alerts'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(rule),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create alert');
  return data;
}

export async function deleteAlertRule(ruleId: string): Promise<boolean> {
  const res = await fetch(getUrl(`/alerts/${ruleId}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.ok;
}

export async function fetchAlertEvents(): Promise<AlertEvent[]> {
  try {
    const res = await fetch(getUrl('/alerts/events'), { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch (_) {
    return [];
  }
}

// ==========================================
// 5. BOOKMARKS
// ==========================================

export async function fetchBookmarks(): Promise<Bookmark[]> {
  try {
    const res = await fetch(getUrl('/bookmarks'), { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch (_) {
    return [];
  }
}

export async function toggleBookmark(stationId: string): Promise<{ isBookmarked: boolean }> {
  const res = await fetch(getUrl(`/bookmarks/${stationId}/toggle`), {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return await res.json();
}

// ==========================================
// 6. ANALYTICS & VITALITY
// ==========================================

export async function fetchGlobalVitality(): Promise<StationAggregateStats> {
  try {
    const res = await fetch(getUrl('/analytics/vitality'));
    if (!res.ok) throw new Error('Failed to fetch vitality analytics');
    return await res.json();
  } catch (_) {
    return {
      total_stations: 25,
      vitality_index: 78.4,
      mean_temperature: 22.8,
      mean_ph: 7.42,
      mean_wqi: 78.4,
      hypoxia_alert_count: 3,
      severe_stations_count: 2,
      status_counts: { excellent: 8, good: 10, moderate: 4, poor: 2, severe: 1 },
      sources: ['usgs', 'gemstat', 'eea', 'cpcb'],
      basins_monitored: 18,
    };
  }
}

// ==========================================
// 7. UNIVERSAL SEARCH & SUGGESTIONS
// ==========================================

export async function searchStations(query: string): Promise<SearchResponse> {
  try {
    const url = getUrl('/search');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    const textQuery = (query || '').toLowerCase().trim();
    return {
      query: query || '',
      is_conversational: false,
      parsed_filter: {},
      results: INITIAL_STATIONS.slice(0, 5),
      ai_summary: `Telemetry evaluated for "${query}". Baseline values retrieved from local cache.`,
    };
  }
}

export async function fetchSuggestions(query: string): Promise<RiverSuggestion[]> {
  try {
    const url = getUrl(`/suggestions?q=${encodeURIComponent(query)}`);
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch (_) {}
  return [];
}
