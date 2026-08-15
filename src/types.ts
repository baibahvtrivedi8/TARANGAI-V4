export type WaterQualityStatus = 'excellent' | 'good' | 'moderate' | 'poor' | 'severe';

export interface Reading {
  parameter: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface Pollutant {
  name: string;
  category: 'Chemical' | 'Biological' | 'Physical' | 'Nutrient' | 'Heavy Metal';
  concentration: string;
  severity: 'low' | 'moderate' | 'high' | 'severe';
  description: string;
}

export interface ConnectedSewer {
  id: string;
  name: string;
  type: 'municipal' | 'industrial' | 'agricultural' | 'stormwater';
  discharge_rate_m3_s: number;
  treatment_status: 'untreated' | 'partially_treated' | 'fully_treated';
  connected_distance_km: number;
}

export interface Station {
  station_id: string;
  source: 'usgs' | 'epa_wqx' | 'eea' | 'gemstat' | 'tarang_iot' | 'cpcb';
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  water_body_type: string;
  basin_name?: string;
  latest_readings: Reading[];
  status: WaterQualityStatus;
  last_updated: string;
  ph_level?: number;
  pollution_percentage?: number;
  wqi?: number;
  pollutants?: Pollutant[];
  connected_sewers?: ConnectedSewer[];
  created_by?: string;
  is_custom?: boolean;
}

export interface ForecastHistoryItem {
  timestamp: string;
  value: number;
}

export interface ForecastPoint {
  timestamp: string;
  predicted_value: number;
  upper_bound: number;
  lower_bound: number;
  status: WaterQualityStatus;
}

export interface Forecast {
  station_id: string;
  parameter: string;
  history: ForecastHistoryItem[];
  projected_crossing_date: string;
  current_status: WaterQualityStatus;
  projected_status_in_90_days: WaterQualityStatus;
  confidence: number;
  method: string;
  future_points?: ForecastPoint[];
  trend_direction?: 'improving' | 'degrading' | 'stable';
  hypoxia_risk_level?: 'none' | 'moderate' | 'critical';
  recommendation?: string;
}

export interface ParsedFilter {
  parameter?: string;
  max_value?: number;
  min_value?: number;
  status?: WaterQualityStatus;
  water_body_type?: string;
  country?: string;
  basin?: string;
}

export interface WQISubIndex {
  parameter: string;
  measured_value: number;
  unit: string;
  ideal_value: number;
  standard_permissible: number;
  weight_factor: number;
  sub_index: number;
  status: 'safe' | 'warning' | 'critical';
}

export interface RiverHealthAssessment {
  wqi: number; // 0 - 100 Water Quality Index
  health_rating: 'Pristine' | 'Healthy' | 'Strained' | 'Polluted' | 'Severely Degraded';
  ph_level: number;
  ph_status: 'Acidic' | 'Optimal Neutral' | 'Slightly Alkaline' | 'Highly Alkaline';
  pollution_percentage: number;
  pollutants: Pollutant[];
  connected_sewers: ConnectedSewer[];
  primary_stressor: string;
  recommended_action: string;
  is_coordinate_query?: boolean;
  detected_coords?: { lat: number; lon: number };
  sub_indices?: WQISubIndex[];
  dissolved_oxygen_saturation_pct?: number;
  trophic_state_index?: 'Oligotrophic' | 'Mesotrophic' | 'Eutrophic' | 'Hyper-eutrophic';
}

export interface RiverSuggestion {
  id: string;
  title: string;
  subtitle: string;
  type: 'river' | 'coordinate' | 'station';
  lat?: number;
  lon?: number;
  status?: WaterQualityStatus;
}

export interface SearchResponse {
  query: string;
  is_conversational?: boolean;
  conversational_reply?: string;
  parsed_filter: ParsedFilter;
  results: Station[];
  ai_summary?: string;
  river_health?: RiverHealthAssessment;
  grounded_citations?: string[];
}

export interface StationAggregateStats {
  total_stations: number;
  vitality_index: number; // 0 - 100
  mean_temperature: number; // °C
  mean_ph: number;
  mean_wqi: number;
  hypoxia_alert_count: number;
  severe_stations_count: number;
  status_counts: Record<WaterQualityStatus, number>;
  sources: string[];
  basins_monitored: number;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  organization?: string;
  role: 'researcher' | 'analyst' | 'admin' | 'observer';
  created_at: string;
  preferences?: {
    default_basin?: string;
    temperature_unit?: 'C' | 'F';
    theme_contrast?: 'standard' | 'high';
  };
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_secret?: string; // Only returned once on creation
  permissions: ('read' | 'write' | 'alerts' | 'admin')[];
  rate_limit_rpm: number;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  is_active: boolean;
}

export interface AlertRule {
  id: string;
  user_id: string;
  station_id: string;
  station_name: string;
  parameter: string;
  operator: 'greater_than' | 'less_than' | 'equals';
  threshold: number;
  unit: string;
  title: string;
  severity: 'info' | 'warning' | 'critical';
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

export interface AlertEvent {
  id: string;
  rule_id: string;
  station_id: string;
  station_name: string;
  parameter: string;
  triggered_value: number;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
}

export interface Bookmark {
  id: string;
  user_id: string;
  station_id: string;
  created_at: string;
}

export interface ComplianceReport {
  id: string;
  station_id: string;
  station_name: string;
  generated_at: string;
  evaluated_by: string;
  wqi_score: number;
  who_compliance: boolean;
  epa_compliance: boolean;
  cpcb_class: 'Class A' | 'Class B' | 'Class C' | 'Class D' | 'Class E';
  primary_exceedances: string[];
  remediation_steps: string[];
  summary: string;
}

export interface PublicApiItem {
  name: string;
  link: string;
  description: string;
  auth: string;
  https: boolean;
  cors: string;
  category: string;
}

export interface PublicApisCatalogResponse {
  total: number;
  categories: string[];
  category_counts: Record<string, number>;
  apis: PublicApiItem[];
}

