import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { db } from './server/db/database.js';
import { publicApisRepo, PublicApiEntry } from './server/db/publicApis.js';
import { authenticate, optionalAuth, createSessionToken } from './server/middleware/auth.js';
import { evaluateRiverHealth, generateAdvancedForecast, generateComplianceReport, calculateWQISubIndices } from './server/engine/hydrology.js';
import { KNOWN_GLOBAL_RIVERS, createDynamicRiverStation, createCoordinateStation } from './src/data/mockStations.js';
import { Station, WaterQualityStatus, RiverHealthAssessment, RiverSuggestion, StationAggregateStats } from './src/types.js';

const getDirname = () => {
  try {
    if (typeof __dirname !== 'undefined') return __dirname;
    return path.dirname(fileURLToPath(import.meta.url));
  } catch (_) {
    return process.cwd();
  }
};
const currentDir = getDirname();

// Helper to detect geographic coordinate strings (e.g. "25.27, 82.99" or "lat 12.97 lon 77.59")
function parseCoordinateQuery(text: string): { lat: number; lon: number } | null {
  const coordRegex = /([-+]?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*([-+]?\d{1,3}(?:\.\d+)?)/;
  const match = text.match(coordRegex);
  if (match) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { lat, lon };
    }
  }
  return null;
}

// Helper to clean query text of action prefixes and quotation marks
function cleanQueryTerm(text: string): string {
  if (!text) return '';
  return text.trim()
    .replace(/^(analyze|search\s+for|search|show\s+me|show|check|inspect|find|tell\s+me\s+about)\s+/i, '')
    .replace(/^(what\s+is\s+(the\s+)?(water\s+quality|wqi|ph)\s+of)\s+/i, '')
    .replace(/^the\s+/i, '')
    .replace(/['"“”`]/g, '')
    .trim();
}

// Helper to detect if input is a specific river node or station lookup
function isSpecificRiverNodeLookup(text: string): boolean {
  const clean = text.toLowerCase().trim();
  if (!clean) return false;

  // 1. Geographic coordinates
  if (parseCoordinateQuery(clean) !== null) return true;

  // 2. Question words indicate general Q&A / knowledge queries, NOT a single telemetry node
  const questionPattern = /^(how many|how much|how|what is|what are|what|why|where|which|can you|tell me|explain|describe|who|is there|are there|list)\b/i;
  if (questionPattern.test(clean)) {
    return false;
  }

  // 3. Known river names or stations
  const knownRivers = [
    'amazon', 'ganges', 'nile', 'rhine', 'yangtze', 'mississippi', 'congo', 'danube',
    'mekong', 'indus', 'volga', 'brahmaputra', 'hudson', 'thames', 'seine', 'colorado',
    'murray', 'yellow river', 'huang he', 'yavari', 'st. lawrence', 'saint lawrence',
    'yamuna', 'kaveri', 'cauvery', 'godavari', 'krishna', 'narmada', 'tapi', 'mahanadi',
    'sutlej', 'beas', 'ravi', 'jhelum', 'chenab', 'sabarmati', 'periyar', 'tagus', 'elbe',
    'po', 'loire', 'rhone', 'shannon', 'dnieper', 'don', 'ob', 'yenisey', 'lena', 'amur',
    'irrawaddy', 'salween', 'chao phraya', 'xi', 'pearl', 'darling', 'waikato', 'niger',
    'zambezi', 'limpopo', 'orange', 'okavango', 'columbia', 'missouri', 'ohio', 'arkansas',
    'red river', 'yukon', 'mackenzie', 'rio grande', 'potomac', 'susquehanna', 'delaware',
    'orinoco', 'parana', 'paraguay', 'uruguay', 'tocantins', 'sao francisco', 'magdalena',
    'rishikesh', 'haridwar', 'kanpur', 'prayagraj', 'varanasi', 'patna', 'kolkata', 'sangam', 'aswan', 'lobith', 'teddington'
  ];

  const hasKnownRiver = knownRivers.some(r => {
    const regex = new RegExp(`\\b${r}\\b`, 'i');
    return regex.test(clean);
  });
  if (hasKnownRiver) return true;

  // 4. Matches any existing station in database
  const matchesStation = db.getStations().some(s => {
    const sName = s.name.toLowerCase();
    const sCountry = s.country.toLowerCase();
    return sName.includes(clean) || sCountry === clean;
  });
  if (matchesStation) return true;

  // 5. Short explicit river phrases like "Ganges River", "Hudson Basin" (must be <= 4 words)
  const explicitWaterKeywords = [
    'river', 'basin', 'estuary', 'delta', 'stream', 'creek', 'watershed'
  ];

  const words = clean.split(/\s+/);
  if (words.length <= 4 && explicitWaterKeywords.some(kw => words.includes(kw))) {
    return true;
  }

  return false;
}

// Helper to detect conversational intent vs hydrological query
function isConversationalQuery(text: string): { isConversational: boolean; reply?: string } {
  const clean = text.toLowerCase().trim();
  if (!clean) {
    return { isConversational: true, reply: "Hello! I am **TARANG AI — HydroWatch Engine**. You can ask me water quality, WQI, hypoxia risk, or river hydrology questions, or search for any river basin (e.g. *'Ganges River'*, *'Amazon'*, *'Rhine'*)." };
  }

  const isSpecificNode = isSpecificRiverNodeLookup(clean);

  if (!isSpecificNode) {
    const greetingRegex = /^(hi|hello|hey|greetings|howdy|good morning|good afternoon|good evening|namaste|hola|bonjour)\b/i;
    const codeRegex = /\b(python|javascript|script|code|api|curl|fetch|program)\b/i;

    let reply = "";
    if (greetingRegex.test(clean)) {
      reply = "Hello! I am **TARANG AI**, your dedicated environmental intelligence & river hydrological assistant. How can I assist your water quality monitoring, WQI calculations, river health queries, or sensor telemetry today?";
    } else if (clean.includes('how many rivers') || clean.includes('rivers in world') || clean.includes('rivers are there in the world') || clean.includes('rivers are there in world')) {
      reply = `**Global River Count & Hydrological Overview:**

There are approximately **165 major rivers** in the world and an estimated **millions of distinct rivers, streams, and tributaries** across the continents.

Key global river milestones:
- **Major Rivers (>1,000 km / 620 miles)**: Around **246 rivers** on Earth exceed 1,000 kilometers in length.
- **Top Longest Rivers**:
  1. **Nile River** (~6,650 km / 4,132 miles) — Africa
  2. **Amazon River** (~6,400 km / 3,977 miles) — South America (Largest by discharge volume)
  3. **Yangtze River** (~6,300 km / 3,915 miles) — Asia
  4. **Mississippi-Missouri System** (~6,275 km / 3,902 miles) — North America
- **Ganges-Brahmaputra Basin**: One of the most densely populated river basins on Earth, supporting over 600 million people with vital irrigation and freshwater ecosystems.

*You can analyze real-time WQI and telemetry for any of these rivers in TARANG AI by typing their name.*`;
    } else if (codeRegex.test(clean)) {
      reply = `Here is a Python script to fetch live hydrological telemetry from the TARANG AI API:

\`\`\`python
import requests

API_URL = "https://tarang-ai.org/api/stations"
API_KEY = "trg_live_YOUR_API_KEY"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

response = requests.get(f"{API_URL}/cpcb-ganga-varanasi", headers=headers)
print("Station Telemetry:", response.json())
\`\`\``;
    } else if (clean.includes('dissolved oxygen') || clean.includes('oxygen standard')) {
      reply = `**Dissolved Oxygen (DO) Standards for Aquatic Water Quality:**

- **> 6.5 mg/L**: **Excellent / Pristine** - Ideal for drinking water sources and sensitive aquatic organisms (trout, salmon).
- **5.0 – 6.5 mg/L**: **Good / Acceptable** - Supports diverse freshwater aquatic life and municipal source intake.
- **3.0 – 5.0 mg/L**: **Moderate / Hypoxic Risk** - Causes ecological stress; sign of non-point nutrient runoff or thermal effluent.
- **< 3.0 mg/L**: **Critical / Severe Hypoxia** - Lethal to fish populations; leads to toxic anaerobic bacterial decomposition.

*Standard Thresholds derived from WHO and CPCB Environmental Water Quality Standards.*`;
    } else if (clean.includes('how are you')) {
      reply = "I'm operational and tracking real-time water quality telemetry across global basins! Ask me about any river basin (e.g. *'Ganges River'*, *'Rhine River'*), enter coordinates, or ask for scientific environmental calculations.";
    } else if (clean.includes('who are you') || clean.includes('your name') || clean.includes('what can you do')) {
      reply = "I am **TARANG AI — HydroWatch Engine**, an environmental intelligence platform for global water monitoring, predictive hypoxia forecasting, chemical pollutant tracing, and automated compliance reporting.";
    } else if (clean.includes('thank')) {
      reply = "You're very welcome! Feel free to ask whenever you need detailed hydrological insights, water quality analysis, or sensor telemetry.";
    } else {
      reply = `I am **TARANG AI**, an environmental intelligence assistant specialized in river hydrology and water quality monitoring.

You can ask me questions about global rivers and water quality telemetry:
- **Ganges River** (Haridwar, Prayagraj, Varanasi, Patna, Kanpur)
- **Amazon River**, **Rhine River**, **Nile River**, **Thames River**
- Or enter GPS coordinates (e.g., *25.3176, 82.9739*) to diagnose water quality metrics.`;
    }
    return { isConversational: true, reply };
  }

  return { isConversational: false };
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // Initialize Gemini AI lazily if key is configured
  const getAi = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'MY_GEMINI_API_KEY') return null;
    return new GoogleGenAI({ apiKey: key });
  };

  // ==========================================
  // 1. AUTHENTICATION & USER MANAGEMENT API
  // ==========================================

  // POST /api/auth/register
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, full_name, organization, role } = req.body || {};
      if (!email || !email.includes('@')) {
        res.status(400).json({ error: 'Valid email address is required.' });
        return;
      }
      if (!password || password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }
      if (!full_name || full_name.trim().length < 2) {
        res.status(400).json({ error: 'Full name is required.' });
        return;
      }

      const user = await db.createUser({
        email,
        password,
        full_name,
        organization,
        role: role || 'researcher',
      });

      const token = createSessionToken(user);
      res.status(201).json({
        user,
        token,
        message: 'Account created successfully.',
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Registration failed.' });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const user = await db.authenticateUser(email, password);
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const token = createSessionToken(user);
      res.json({
        user,
        token,
        message: 'Authentication successful.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Authentication error.' });
    }
  });

  // GET /api/auth/me
  app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ user: req.user });
  });

  // PATCH & POST /api/auth/profile
  app.patch('/api/auth/profile', authenticate, (req, res) => {
    try {
      const updatedUser = db.updateUserProfile(req.user!.id, req.body || {});
      if (!updatedUser) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      res.json({
        user: updatedUser,
        message: 'Profile and preferences successfully saved to database.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update profile.' });
    }
  });

  app.post('/api/auth/profile', authenticate, (req, res) => {
    try {
      const updatedUser = db.updateUserProfile(req.user!.id, req.body || {});
      if (!updatedUser) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      res.json({
        user: updatedUser,
        message: 'Profile and preferences successfully saved to database.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update profile.' });
    }
  });

  // ==========================================
  // 2. PER-USER API KEY MANAGEMENT
  // ==========================================

  // GET /api/keys
  app.get('/api/keys', authenticate, (req, res) => {
    const keys = db.getApiKeysByUserId(req.user!.id);
    res.json(keys);
  });

  // POST /api/keys
  app.post('/api/keys', authenticate, (req, res) => {
    const { name, permissions } = req.body || {};
    const result = db.createApiKey(
      req.user!.id,
      name || 'HydroWatch API Key',
      permissions || ['read', 'write']
    );
    res.status(201).json(result);
  });

  // DELETE /api/keys/:id
  app.delete('/api/keys/:id', authenticate, (req, res) => {
    const success = db.deleteApiKey(req.params.id as string, req.user!.id);
    if (!success) {
      res.status(404).json({ error: 'API key not found or unauthorized.' });
      return;
    }
    res.json({ message: 'API key revoked successfully.' });
  });

  // ==========================================
  // 3. STATIONS & TELEMETRY API
  // ==========================================

  // GET /api/stations
  app.get('/api/stations', optionalAuth, (req, res) => {
    const { country, status, search, basin } = req.query;
    const stations = db.getStations({
      country: country as string,
      status: status as string,
      search: search as string,
      basin: basin as string,
    });
    res.json(stations);
  });

  // GET /api/stations/:id
  app.get('/api/stations/:id', optionalAuth, (req, res) => {
    const station = db.getStationById(req.params.id as string);
    if (!station) {
      res.status(404).json({ error: `Station with ID ${req.params.id} not found` });
      return;
    }
    const riverHealth = evaluateRiverHealth(station);
    res.json({ ...station, river_health: riverHealth });
  });

  // POST /api/stations (Create Custom IoT Sensor Station)
  app.post('/api/stations', authenticate, (req, res) => {
    try {
      const station = db.addCustomStation(req.body, req.user!.id);
      res.status(201).json(station);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to create station.' });
    }
  });

  // POST /api/stations/:id/telemetry (Ingest Sensor Reading)
  app.post('/api/stations/:id/telemetry', authenticate, (req, res) => {
    const { readings } = req.body || {};
    if (!Array.isArray(readings) || readings.length === 0) {
      res.status(400).json({ error: 'Array of readings is required.' });
      return;
    }
    const updated = db.recordTelemetry(req.params.id as string, readings);
    if (!updated) {
      res.status(404).json({ error: `Station with ID ${req.params.id} not found.` });
      return;
    }
    res.json({ message: 'Telemetry recorded successfully.', station: updated });
  });

  // GET /api/stations/:id/forecast
  app.get('/api/stations/:id/forecast', (req, res) => {
    const station = db.getStationById(req.params.id as string);
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const parameter = (req.query.parameter as string) || 'dissolved_oxygen_mg_l';
    const horizon = parseInt((req.query.horizon_days as string) || '90', 10);
    const forecast = generateAdvancedForecast(station, parameter, horizon);
    res.json(forecast);
  });

  // GET /api/stations/:id/report
  app.get('/api/stations/:id/report', (req, res) => {
    const station = db.getStationById(req.params.id as string);
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const evaluator = (req.query.evaluator as string) || 'TARANG AI Environmental Engine';
    const report = generateComplianceReport(station, evaluator);
    res.json(report);
  });

  // GET /api/stations/:id/export
  app.get('/api/stations/:id/export', (req, res) => {
    const station = db.getStationById(req.params.id as string);
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const format = (req.query.format as string) || 'json';

    if (format === 'csv') {
      const headers = 'Parameter,Value,Unit,Timestamp\n';
      const rows = station.latest_readings
        .map(r => `"${r.parameter}",${r.value},"${r.unit}","${r.timestamp}"`)
        .join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${station.station_id}-telemetry.csv"`);
      res.send(headers + rows);
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${station.station_id}-telemetry.json"`);
    res.json(station);
  });

  // ==========================================
  // 4. ALERTS & MONITORING
  // ==========================================

  // GET /api/alerts
  app.get('/api/alerts', authenticate, (req, res) => {
    const alerts = db.getAlertsByUserId(req.user!.id);
    res.json(alerts);
  });

  // POST /api/alerts
  app.post('/api/alerts', authenticate, (req, res) => {
    const { station_id, station_name, parameter, operator, threshold, unit, title, severity } = req.body || {};
    if (!station_id || !parameter || threshold === undefined) {
      res.status(400).json({ error: 'station_id, parameter, and threshold are required.' });
      return;
    }

    const rule = db.createAlertRule({
      user_id: req.user!.id,
      station_id,
      station_name: station_name || 'Monitoring Node',
      parameter,
      operator: operator || 'less_than',
      threshold: Number(threshold),
      unit: unit || 'mg/L',
      title: title || `Threshold Alert for ${parameter}`,
      severity: severity || 'warning',
      is_active: true,
    });
    res.status(201).json(rule);
  });

  // DELETE /api/alerts/:id
  app.delete('/api/alerts/:id', authenticate, (req, res) => {
    const success = db.deleteAlertRule(req.params.id as string, req.user!.id);
    if (!success) {
      res.status(404).json({ error: 'Alert not found or unauthorized.' });
      return;
    }
    res.json({ message: 'Alert rule removed.' });
  });

  // GET /api/alerts/events
  app.get('/api/alerts/events', authenticate, (req, res) => {
    const events = db.getAlertEvents(req.user!.id);
    res.json(events);
  });

  // ==========================================
  // 5. BOOKMARKS
  // ==========================================

  // GET /api/bookmarks
  app.get('/api/bookmarks', authenticate, (req, res) => {
    const bms = db.getBookmarksByUserId(req.user!.id);
    res.json(bms);
  });

  // POST /api/bookmarks/:stationId/toggle
  app.post('/api/bookmarks/:stationId/toggle', authenticate, (req, res) => {
    const result = db.toggleBookmark(req.user!.id, req.params.stationId as string);
    res.json(result);
  });

  // ==========================================
  // 6. GLOBAL ANALYTICS & VITALITY
  // ==========================================

  // GET /api/analytics/vitality
  app.get('/api/analytics/vitality', (req, res) => {
    const stations = db.getStations();
    const weights: Record<WaterQualityStatus, number> = {
      excellent: 100,
      good: 85,
      moderate: 65,
      poor: 40,
      severe: 15,
    };

    const statusCounts: Record<WaterQualityStatus, number> = {
      excellent: 0,
      good: 0,
      moderate: 0,
      poor: 0,
      severe: 0,
    };

    let sumScores = 0;
    let sumPH = 0;
    let sumTemp = 0;
    let hypoxiaCount = 0;
    const sourcesSet = new Set<string>();

    stations.forEach(s => {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
      sumScores += weights[s.status] || 70;
      sourcesSet.add(s.source);

      const ph = s.ph_level || s.latest_readings.find(r => r.parameter === 'ph')?.value || 7.4;
      const temp = s.latest_readings.find(r => r.parameter === 'water_temperature_c')?.value || 22.0;
      const doVal = s.latest_readings.find(r => r.parameter === 'dissolved_oxygen_mg_l')?.value || 7.0;

      sumPH += ph;
      sumTemp += temp;
      if (doVal < 4.0) hypoxiaCount++;
    });

    const vitalityIndex = Number((sumScores / Math.max(1, stations.length)).toFixed(1));
    const meanPH = Number((sumPH / Math.max(1, stations.length)).toFixed(2));
    const meanTemp = Number((sumTemp / Math.max(1, stations.length)).toFixed(1));

    const stats: StationAggregateStats = {
      total_stations: stations.length,
      vitality_index: vitalityIndex,
      mean_temperature: meanTemp,
      mean_ph: meanPH,
      mean_wqi: vitalityIndex,
      hypoxia_alert_count: hypoxiaCount,
      severe_stations_count: statusCounts.severe + statusCounts.poor,
      status_counts: statusCounts,
      sources: Array.from(sourcesSet),
      basins_monitored: 18,
    };

    res.json(stats);
  });

  // ==========================================
  // 7. UNIVERSAL SEARCH & GROUNDED GEMINI AI
  // ==========================================

  // POST /api/search
  app.post('/api/search', async (req, res) => {
    const { query } = req.body || {};
    const textQuery = (query || '').toLowerCase().trim();

    // Check conversational intent first!
    const conversationalCheck = isConversationalQuery(textQuery);
    if (conversationalCheck.isConversational) {
      let reply = conversationalCheck.reply;

      // Check if user is asking about public APIs, weather APIs, or integrations
      const isAskingAboutApis = /\b(api|apis|dataset|endpoints|public api|public-apis|rest api|weather api|nasa|open-meteo|noaa|water api)\b/i.test(textQuery);
      let matchedPublicApis: PublicApiEntry[] = [];
      if (isAskingAboutApis || textQuery.length > 2) {
        matchedPublicApis = publicApisRepo.search(textQuery, undefined, 5);
      }

      try {
        const ai = getAi();
        if (ai) {
          let apiContextPrompt = '';
          if (matchedPublicApis.length > 0) {
            apiContextPrompt = `\n\nRelevant APIs indexed in database:\n` + matchedPublicApis.map(a => `- ${a.name} (${a.category}): ${a.description} [Auth: ${a.auth}, Link: ${a.link}]`).join('\n');
          }

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are TARANG AI — HydroWatch Engine, an environmental hydrological AI expert specialized in water quality monitoring, WQI (Water Quality Index) calculations, hypoxia risk diagnostics, pollutant tracking, and compliance evaluations across global river basins and the Ganges River basin (Haridwar, Kanpur, Prayagraj, Varanasi, Patna).
Respond directly, accurately, and scientifically to the user prompt:
"${query}"`,
          });
          if (response.text) {
            reply = response.text;
          }
        }
      } catch (err) {
        console.warn('Gemini conversational response fallback:', err);
      }

      res.json({
        query: query || '',
        is_conversational: true,
        conversational_reply: reply,
        parsed_filter: {},
        results: [],
        ai_summary: reply,
        matched_public_apis: matchedPublicApis,
      });
      return;
    }

    let parsedFilter: any = {};
    let filteredStations: Station[] = [];
    let aiSummary = '';
    let coordQuery = parseCoordinateQuery(textQuery);
    const allDbStations = db.getStations();

    if (coordQuery) {
      const coordStation = createCoordinateStation(coordQuery.lat, coordQuery.lon);
      filteredStations = [coordStation, ...allDbStations.slice(0, 4)];
      parsedFilter.coordinates = coordQuery;
    } else if (!textQuery) {
      filteredStations = [...allDbStations];
    } else {
      // 1. Text & Parameter Filter matching against database stations
      filteredStations = allDbStations.filter(s => {
        const nameMatch = s.name.toLowerCase().includes(textQuery);
        const countryMatch = s.country.toLowerCase().includes(textQuery);
        const waterTypeMatch = s.water_body_type.toLowerCase().includes(textQuery);
        const sourceMatch = s.source.toLowerCase().includes(textQuery);
        const statusMatch = s.status.toLowerCase().includes(textQuery);
        return nameMatch || countryMatch || waterTypeMatch || sourceMatch || statusMatch;
      });

      // Special parameter/status query flags
      if (textQuery.includes('severe')) {
        parsedFilter.status = 'severe';
        filteredStations = allDbStations.filter(s => s.status === 'severe');
      } else if (textQuery.includes('poor')) {
        parsedFilter.status = 'poor';
        filteredStations = allDbStations.filter(s => s.status === 'poor' || s.status === 'severe');
      } else if (textQuery.includes('excellent') || textQuery.includes('good') || textQuery.includes('clean')) {
        parsedFilter.status = 'good';
        filteredStations = allDbStations.filter(s => s.status === 'excellent' || s.status === 'good');
      } else if (textQuery.includes('dissolved oxygen') || textQuery.includes('oxygen')) {
        parsedFilter.parameter = 'dissolved_oxygen_mg_l';
        filteredStations = [...allDbStations].sort((a, b) => {
          const valA = a.latest_readings.find(r => r.parameter === 'dissolved_oxygen_mg_l')?.value || 0;
          const valB = b.latest_readings.find(r => r.parameter === 'dissolved_oxygen_mg_l')?.value || 0;
          return valA - valB;
        });
      } else if (textQuery.includes('turbidity') || textQuery.includes('sediment')) {
        parsedFilter.parameter = 'turbidity_ntu';
        filteredStations = [...allDbStations].sort((a, b) => {
          const valA = a.latest_readings.find(r => r.parameter === 'turbidity_ntu')?.value || 0;
          const valB = b.latest_readings.find(r => r.parameter === 'turbidity_ntu')?.value || 0;
          return valB - valA;
        });
      }

      // If no exact station matches in dataset, dynamically synthesize river station for verified river query
      if (filteredStations.length === 0) {
        const dynamicStation = createDynamicRiverStation(textQuery);
        if (!filteredStations.some(s => s.name.toLowerCase() === dynamicStation.name.toLowerCase())) {
          filteredStations.unshift(dynamicStation);
        }
      }
    }

    filteredStations = filteredStations.slice(0, 8);
    const primaryStation = filteredStations[0] || allDbStations[0];
    const riverHealth = evaluateRiverHealth(primaryStation, !!coordQuery, coordQuery || undefined);

    // Attempt Gemini AI summary if configured
    try {
      const ai = getAi();
      if (ai) {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `You are TARANG AI, an expert environmental hydrological AI agent. Provide a 2-3 sentence executive scientific analysis answering the user prompt: "${query}". Refer to target river/node "${primaryStation.name}" with calculated WQI: ${riverHealth.wqi}/100 (${riverHealth.health_rating}), pH Level: ${riverHealth.ph_level} (${riverHealth.ph_status}), and Water Pollution: ${riverHealth.pollution_percentage}% polluted. Key Pollutants: ${riverHealth.pollutants.map(p => p.name).join(', ')}. Connected Sewers: ${riverHealth.connected_sewers.map(s => s.name).join(', ')}. Emphasize primary stressor ("${riverHealth.primary_stressor}") and key health diagnosis. Keep tone authoritative, environmental, and helpful.`,
        });
        aiSummary = response.text || '';
      }
    } catch (err) {
      console.warn('Gemini query processing skipped/fallback:', err);
    }

    if (!aiSummary) {
      if (coordQuery) {
        aiSummary = `Target location (${coordQuery.lat.toFixed(3)}°, ${coordQuery.lon.toFixed(3)}°) mapped to hydro node "${primaryStation.name}". Water Quality Index (WQI) is ${riverHealth.wqi}/100 (${riverHealth.health_rating.toUpperCase()}), pH Level is ${riverHealth.ph_level} (${riverHealth.ph_status}), and Water Contamination is at ${riverHealth.pollution_percentage}%. Main stressor: ${riverHealth.primary_stressor}.`;
      } else {
        aiSummary = `Hydrological health assessment completed for "${query}". Target river node "${primaryStation.name}" exhibits WQI of ${riverHealth.wqi}/100 (${riverHealth.health_rating.toUpperCase()}), pH Level ${riverHealth.ph_level} (${riverHealth.ph_status}), and ${riverHealth.pollution_percentage}% Water Contamination. Primary stressor: ${riverHealth.primary_stressor}.`;
      }
    }

    res.json({
      query: query || '',
      is_conversational: false,
      parsed_filter: parsedFilter,
      results: filteredStations,
      ai_summary: aiSummary,
      river_health: riverHealth,
    });
  });

  // GET /api/suggestions
  app.get('/api/suggestions', (req, res) => {
    const q = ((req.query.q as string) || '').toLowerCase().trim();
    if (!q) {
      const defaults: RiverSuggestion[] = KNOWN_GLOBAL_RIVERS.slice(0, 5).map(r => ({
        id: `sug-${r.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        title: r.name,
        subtitle: `${r.country} • Typical status: ${r.typicalStatus.toUpperCase()}`,
        type: 'river',
        lat: r.lat,
        lon: r.lon,
        status: r.typicalStatus,
      }));
      res.json(defaults);
      return;
    }

    const suggestions: RiverSuggestion[] = [];

    // 1. Geographic coordinates
    const coords = parseCoordinateQuery(q);
    if (coords) {
      suggestions.push({
        id: `sug-coord-${coords.lat}-${coords.lon}`,
        title: `📍 Coordinates (${coords.lat.toFixed(4)}°, ${coords.lon.toFixed(4)}°)`,
        subtitle: `Create dynamic hydro-observatory node at exact geographical coordinates`,
        type: 'coordinate',
        lat: coords.lat,
        lon: coords.lon,
      });
    }

    // 2. Search known rivers database
    const matchingRivers = KNOWN_GLOBAL_RIVERS.filter(r =>
      r.name.toLowerCase().includes(q) || r.country.toLowerCase().includes(q)
    );
    matchingRivers.forEach(r => {
      suggestions.push({
        id: `sug-river-${r.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        title: r.name,
        subtitle: `${r.country} • Stressor: ${r.primaryStressor}`,
        type: 'river',
        lat: r.lat,
        lon: r.lon,
        status: r.typicalStatus,
      });
    });

    // 3. Search database station telemetry nodes
    const matchingStations = db.getStations({ search: q });
    matchingStations.forEach(s => {
      suggestions.push({
        id: `sug-st-${s.station_id}`,
        title: s.name,
        subtitle: `${s.country} • Source: ${s.source.toUpperCase()} (${s.status.toUpperCase()})`,
        type: 'station',
        lat: s.latitude,
        lon: s.longitude,
        status: s.status,
      });
    });

    if (suggestions.length === 0 && q.length > 1) {
      suggestions.push({
        id: `sug-dyn-${q}`,
        title: `Analyze "${q.charAt(0).toUpperCase() + q.slice(1)}" Basin`,
        subtitle: `Synthesize river health model & telemetry predictions for unlisted water body`,
        type: 'river',
      });
    }

    res.json(suggestions.slice(0, 7));
  });

  // ==========================================
  // 8. PUBLIC APIS REPOSITORY (1,700+ APIS DATASET)
  // ==========================================

  // GET /api/public-apis
  app.get('/api/public-apis', (req, res) => {
    const q = (req.query.q as string) || '';
    const category = (req.query.category as string) || '';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const apis = publicApisRepo.search(q, category, limit);
    const categories = publicApisRepo.getCategories();
    const categoryCounts = publicApisRepo.getCategorySummary();

    res.json({
      total: publicApisRepo.count(),
      returned: apis.length,
      categories,
      category_counts: categoryCounts,
      apis,
    });
  });

  // GET /api/public-apis/categories
  app.get('/api/public-apis/categories', (req, res) => {
    res.json({
      categories: publicApisRepo.getCategories(),
      category_counts: publicApisRepo.getCategorySummary(),
      total_apis: publicApisRepo.count(),
    });
  });

  // Direct alias routes for frontend backward compatibility
  app.get('/stations', (req, res) => res.redirect('/api/stations'));
  app.get('/stations/:id', (req, res) => res.redirect(`/api/stations/${req.params.id as string}`));
  app.get('/suggestions', (req, res) => res.redirect(`/api/suggestions?q=${encodeURIComponent((req.query.q as string) || '')}`));

  // Vite development middleware vs production static bundle
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.get('*all', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(currentDir, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TARANG AI HydroWatch Server running on http://localhost:${PORT}`);
  });
}

startServer();
