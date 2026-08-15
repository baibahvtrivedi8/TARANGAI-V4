import React, { useEffect, useState } from 'react';
import { Station, Forecast, WaterQualityStatus, Reading, ComplianceReport } from '../types';
import { fetchStationById, fetchStationForecast, recordTelemetry, fetchStationReport, toggleBookmark, fetchBookmarks } from '../services/api';

interface StationDetailProps {
  stationId: string;
  onNavigate: (route: string) => void;
}

const STATUS_COLORS: Record<WaterQualityStatus, string> = {
  excellent: '#839958',
  good: '#97ad6a',
  moderate: '#e6a15c',
  poor: '#d3968c',
  severe: '#e26d5c',
};

export const StationDetail: React.FC<StationDetailProps> = ({ stationId, onNavigate }) => {
  const [station, setStation] = useState<Station | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [selectedParam, setSelectedParam] = useState<string>('dissolved_oxygen_mg_l');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Features state
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Ingestion form state
  const [ingestDO, setIngestDO] = useState('7.2');
  const [ingestPH, setIngestPH] = useState('7.4');
  const [ingestTurbidity, setIngestTurbidity] = useState('14.0');
  const [ingestTemp, setIngestTemp] = useState('24.0');
  const [ingestNitrate, setIngestNitrate] = useState('2.5');
  const [ingesting, setIngesting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchStationById(stationId),
      fetchStationForecast(stationId, selectedParam, 90),
      fetchBookmarks(),
    ])
      .then(([stationData, forecastData, bms]) => {
        if (isMounted) {
          setStation(stationData);
          setForecast(forecastData);
          setIsBookmarked(bms.some(b => b.station_id === stationId));
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          console.error('Error fetching station detail:', err);
          setError(`Could not load station data for "${stationId}"`);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [stationId, selectedParam]);

  const handleToggleBookmark = async () => {
    try {
      const res = await toggleBookmark(stationId);
      setIsBookmarked(res.isBookmarked);
    } catch (_) {
      setIsBookmarked(!isBookmarked);
    }
  };

  const handleOpenReport = async () => {
    setShowReportModal(true);
    setReportLoading(true);
    try {
      const rep = await fetchStationReport(stationId);
      setReport(rep);
    } catch (err) {
      console.warn('Report error', err);
    } finally {
      setReportLoading(false);
    }
  };

  const handleIngestTelemetry = async (e: React.FormEvent) => {
    e.preventDefault();
    setIngesting(true);
    try {
      const updatedStation = await recordTelemetry(stationId, [
        { parameter: 'dissolved_oxygen_mg_l', value: parseFloat(ingestDO), unit: 'mg/L' },
        { parameter: 'ph', value: parseFloat(ingestPH), unit: 'pH' },
        { parameter: 'turbidity_ntu', value: parseFloat(ingestTurbidity), unit: 'NTU' },
        { parameter: 'water_temperature_c', value: parseFloat(ingestTemp), unit: '°C' },
        { parameter: 'nitrate_mg_l', value: parseFloat(ingestNitrate), unit: 'mg/L' },
      ]);
      setStation(updatedStation);
      setShowIngestModal(false);
      // Refresh forecast
      const fc = await fetchStationForecast(stationId, selectedParam, 90);
      setForecast(fc);
    } catch (err: any) {
      alert(err.message || 'Telemetry ingestion failed. Ensure you are signed in.');
    } finally {
      setIngesting(false);
    }
  };

  const handleExport = (format: 'csv' | 'json') => {
    window.open(`/api/stations/${stationId}/export?format=${format}`, '_blank');
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-72px)] w-full flex flex-col justify-center items-center p-8 bg-[#0B130E]">
        <div className="h-12 w-12 border-4 border-[#839958]/20 border-t-[#839958] rounded-full animate-spin mb-4" />
        <p className="font-body-md text-[#839958] animate-pulse font-medium">
          Connecting to station telemetry node & running hydrological models...
        </p>
      </div>
    );
  }

  if (error || !station) {
    return (
      <div className="h-[calc(100vh-72px)] w-full flex flex-col justify-center items-center p-8 bg-[#0B130E] text-center">
        <div className="h-16 w-16 bg-red-500/20 rounded-full flex items-center justify-center text-red-400 mb-4">
          <span className="material-symbols-outlined text-3xl">warning</span>
        </div>
        <h3 className="font-headline-lg text-2xl text-white font-bold mb-2">Station Offline</h3>
        <p className="font-body-md text-outline-variant max-w-md mb-6">{error || 'Station data not found'}</p>
        <button
          onClick={() => onNavigate('/')}
          className="bg-[#839958] text-[#0A3323] px-6 py-3 rounded-full font-bold hover:bg-[#97ad6a] transition-all uppercase text-xs tracking-widest cursor-pointer"
        >
          Return to Global View
        </button>
      </div>
    );
  }

  const getReading = (paramKey: string): Reading | undefined => {
    return station.latest_readings.find(r => r.parameter === paramKey);
  };

  const doReading = getReading('dissolved_oxygen_mg_l');
  const turbidityReading = getReading('turbidity_ntu');
  const nitrateReading = getReading('nitrate_mg_l');
  const bodReading = getReading('biochemical_oxygen_demand_mg_l');
  const phReading = getReading('ph');
  const tempReading = getReading('water_temperature_c') || getReading('temperature_c');

  // SVG Chart Calculation with 95% Confidence Band
  const renderChart = () => {
    if (!forecast || !forecast.history.length) return null;

    const width = 720;
    const height = 200;
    const padding = 40;

    const histValues = forecast.history.map(h => h.value);
    const projValues = forecast.projected_points ? forecast.projected_points.map(p => p.predicted_value) : [];
    const allValues = [...histValues, ...projValues];

    const minVal = Math.max(0, Math.min(...allValues) * 0.85);
    const maxVal = Math.max(...allValues) * 1.15;
    const range = maxVal - minVal || 1;

    const totalPoints = forecast.history.length + (forecast.projected_points?.length || 8);
    const stepX = (width - padding * 2) / (totalPoints - 1);

    // Historic path
    let solidD = '';
    const points: { x: number; y: number; val: number; date: string }[] = [];

    forecast.history.forEach((h, idx) => {
      const x = padding + idx * stepX;
      const y = height - padding - ((h.value - minVal) / range) * (height - padding * 2);
      points.push({ x, y, val: h.value, date: new Date(h.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }) });
      solidD += `${idx === 0 ? 'M' : 'L'} ${x} ${y} `;
    });

    // Projected path & Confidence Polygon
    let dashedD = '';
    let upperPoly = '';
    let lowerPoly = '';

    if (forecast.projected_points && forecast.projected_points.length > 0) {
      const lastHistPoint = points[points.length - 1];
      dashedD = `M ${lastHistPoint.x} ${lastHistPoint.y} `;
      upperPoly = `M ${lastHistPoint.x} ${lastHistPoint.y} `;
      lowerPoly = `L ${lastHistPoint.x} ${lastHistPoint.y} `;

      forecast.projected_points.forEach((p, idx) => {
        const x = padding + (forecast.history.length + idx) * stepX;
        const yPred = height - padding - ((p.predicted_value - minVal) / range) * (height - padding * 2);
        const yUpper = height - padding - ((p.upper_bound - minVal) / range) * (height - padding * 2);
        const yLower = height - padding - ((p.lower_bound - minVal) / range) * (height - padding * 2);

        dashedD += `L ${x} ${yPred} `;
        upperPoly += `L ${x} ${yUpper} `;
        lowerPoly = `L ${x} ${yLower} ` + lowerPoly;
      });
    }

    const confidencePolygonD = upperPoly + lowerPoly + ' Z';

    return { solidD, dashedD, confidencePolygonD, points, width, height, padding, minVal, maxVal };
  };

  const chartData = renderChart();

  return (
    <div className="min-h-[calc(100vh-72px)] w-full bg-[#0B130E] p-4 md:p-8 overflow-y-auto">
      {/* Top Navigation Bar */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <button
          onClick={() => onNavigate('/')}
          className="flex items-center gap-2 text-xs font-bold text-outline-variant hover:text-white uppercase font-label-caps tracking-widest transition-colors cursor-pointer bg-[#111C16] px-4 py-2 rounded-xl border border-[#839958]/20"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Global Basin Network
        </button>

        <div className="flex items-center gap-2">
          {/* Bookmark Toggle Button */}
          <button
            onClick={handleToggleBookmark}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-label-caps uppercase border transition-all cursor-pointer ${
              isBookmarked
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-[#111C16] text-outline-variant hover:text-white border-[#839958]/20'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {isBookmarked ? 'bookmark_added' : 'bookmark_border'}
            </span>
            {isBookmarked ? 'Saved' : 'Bookmark'}
          </button>

          {/* Ingest Telemetry Button */}
          <button
            onClick={() => setShowIngestModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold font-label-caps uppercase bg-[#1A2D23] hover:bg-[#233D2F] text-[#839958] border border-[#839958]/30 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">sensors</span>
            Ingest Telemetry
          </button>

          {/* Compliance Report Button */}
          <button
            onClick={handleOpenReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold font-label-caps uppercase bg-[#1A2D23] hover:bg-[#233D2F] text-white border border-[#839958]/30 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">assignment</span>
            Compliance Audit
          </button>

          {/* Export Dropdown */}
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold font-label-caps uppercase bg-[#111C16] hover:bg-[#1A2D23] text-outline-variant hover:text-white border border-[#839958]/20 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            CSV
          </button>
        </div>
      </div>

      {/* Station Title Header Card */}
      <div className="glass-panel organic-card rounded-[32px] p-6 md:p-8 mb-6 border border-[#839958]/20 shadow-2xl bg-[#111C16]">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span
                className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider text-[#0A3323] bg-[#839958]"
              >
                {station.status} STATUS
              </span>
              <span className="font-parisienne text-sm text-[#F7F4D5]">
                Node {station.station_id}
              </span>
              <span className="font-label-caps text-xs text-[#839958] uppercase tracking-widest font-bold">
                SOURCE: {station.source.toUpperCase()}
              </span>
            </div>

            <h1 className="font-yrguma text-3xl md:text-5xl font-bold text-white mb-2 tracking-tight">
              {station.name}
            </h1>

            <p className="font-body-md text-outline-variant text-sm md:text-base font-medium">
              {station.country} • {station.water_body_type.toUpperCase()} CATCHMENT • Coordinates:{' '}
              <span className="font-label-caps text-[#F7F4D5]">
                {station.latitude.toFixed(4)}°N, {station.longitude.toFixed(4)}°E
              </span>
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => onNavigate('/assistant')}
              className="bg-[#839958] hover:bg-[#97ad6a] text-[#0A3323] px-5 py-3 rounded-full font-black flex items-center gap-2 transition-all active:scale-95 text-xs uppercase tracking-wider cursor-pointer shadow-lg"
            >
              <span className="material-symbols-outlined text-base">psychology</span>
              Analyze with TARANG AI
            </button>
          </div>
        </div>
      </div>

      {/* Bento Grid: Primary Water Vitals */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Card 1: Dissolved Oxygen */}
        <div className="glass-panel organic-card rounded-3xl p-6 border border-[#839958]/20 shadow-xl flex flex-col justify-between bg-[#111C16]">
          <div>
            <div className="flex justify-between items-start mb-3">
              <div className="bg-[#1A2D23] px-3 py-1 rounded-full border border-[#839958]/20">
                <span className="font-label-caps text-[10px] text-[#839958] uppercase tracking-widest font-black">
                  Primary Vital
                </span>
              </div>
              <span className="material-symbols-outlined text-[#839958]">air</span>
            </div>

            <h3 className="font-label-caps text-xs text-outline-variant uppercase tracking-widest mb-1 font-bold">
              Dissolved Oxygen
            </h3>

            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-data-display text-4xl text-[#F7F4D5] font-extrabold">
                {doReading ? doReading.value : '7.8'}
              </span>
              <span className="font-body-sm text-sm text-outline-variant font-bold">mg/L</span>
            </div>

            <div className="h-2 w-full bg-[#0D1711] rounded-full overflow-hidden mb-3 border border-white/5">
              <div
                className="h-full bg-[#839958] rounded-full"
                style={{ width: `${Math.min(100, ((doReading?.value || 7.8) / 12) * 100)}%` }}
              />
            </div>
          </div>

          <p className="font-body-sm text-xs text-outline-variant">
            Target aquatic health range: <span className="text-white font-bold">6.5 - 10.0 mg/L</span>
          </p>
        </div>

        {/* Card 2: Turbidity */}
        <div className="glass-panel organic-card rounded-3xl p-6 border border-[#839958]/20 shadow-xl flex flex-col justify-between bg-[#111C16]">
          <div>
            <div className="flex justify-between items-start mb-3">
              <div className="bg-[#1A2D23] px-3 py-1 rounded-full border border-[#839958]/20">
                <span className="font-label-caps text-[10px] text-[#839958] uppercase tracking-widest font-black">
                  Water Clarity
                </span>
              </div>
              <span className="material-symbols-outlined text-[#D3968C]">water</span>
            </div>

            <h3 className="font-label-caps text-xs text-outline-variant uppercase tracking-widest mb-1 font-bold">
              Turbidity Index
            </h3>

            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-data-display text-4xl text-[#D3968C] font-extrabold">
                {turbidityReading ? turbidityReading.value : '18.5'}
              </span>
              <span className="font-body-sm text-sm text-outline-variant font-bold">NTU</span>
            </div>

            <div className="h-2 w-full bg-[#0D1711] rounded-full overflow-hidden mb-3 border border-white/5">
              <div
                className="h-full bg-[#D3968C] rounded-full"
                style={{ width: `${Math.min(100, ((turbidityReading?.value || 18.5) / 50) * 100)}%` }}
              />
            </div>
          </div>

          <p className="font-body-sm text-xs text-outline-variant">
            Potable threshold: <span className="text-white font-bold">&lt; 5.0 NTU</span>
          </p>
        </div>

        {/* Card 3: Nitrate & BOD */}
        <div className="glass-panel organic-card rounded-3xl p-6 border border-[#839958]/20 shadow-xl flex flex-col justify-between bg-[#111C16]">
          <div>
            <div className="flex justify-between items-start mb-3">
              <div className="bg-[#1A2D23] px-3 py-1 rounded-full border border-[#839958]/20">
                <span className="font-label-caps text-[10px] text-[#839958] uppercase tracking-widest font-black">
                  Chemical Load
                </span>
              </div>
              <span className="material-symbols-outlined text-[#E6A15C]">science</span>
            </div>

            <h3 className="font-label-caps text-xs text-outline-variant uppercase tracking-widest mb-1 font-bold">
              Nitrate & BOD
            </h3>

            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-data-display text-4xl text-[#E6A15C] font-extrabold">
                {nitrateReading ? nitrateReading.value : '2.1'}
              </span>
              <span className="font-body-sm text-sm text-outline-variant font-bold">mg/L NO₃</span>
            </div>

            <div className="h-2 w-full bg-[#0D1711] rounded-full overflow-hidden mb-3 border border-white/5">
              <div
                className="h-full bg-[#E6A15C] rounded-full"
                style={{ width: `${Math.min(100, ((nitrateReading?.value || 2.1) / 10) * 100)}%` }}
              />
            </div>
          </div>

          <p className="font-body-sm text-xs text-outline-variant">
            BOD Level: <span className="text-white font-bold">{bodReading ? `${bodReading.value} mg/L` : '3.2 mg/L'}</span>
          </p>
        </div>

        {/* Card 4: pH and Temperature */}
        <div className="glass-panel organic-card rounded-3xl p-6 border border-[#839958]/20 shadow-xl flex flex-col justify-between bg-[#111C16]">
          <div>
            <div className="flex justify-between items-start mb-3">
              <div className="bg-[#1A2D23] px-3 py-1 rounded-full border border-[#839958]/20">
                <span className="font-label-caps text-[10px] text-[#839958] uppercase tracking-widest font-black">
                  Equilibrium
                </span>
              </div>
              <span className="material-symbols-outlined text-[#839958]">thermostat</span>
            </div>

            <h3 className="font-label-caps text-xs text-outline-variant uppercase tracking-widest mb-1 font-bold">
              pH & Temp
            </h3>

            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-data-display text-4xl text-white font-extrabold">
                {station.ph_level || (phReading ? phReading.value : '7.4')}
              </span>
              <span className="font-body-sm text-sm text-outline-variant font-bold">pH</span>
            </div>

            <div className="h-2 w-full bg-[#0D1711] rounded-full overflow-hidden mb-3 border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-red-500 via-emerald-400 to-purple-600 rounded-full"
                style={{ width: `${(((station.ph_level || phReading?.value || 7.4) / 14) * 100)}%` }}
              />
            </div>
          </div>

          <p className="font-body-sm text-xs text-outline-variant">
            Water Temperature: <span className="text-white font-bold">{tempReading ? `${tempReading.value} °C` : '24.5 °C'}</span>
          </p>
        </div>
      </div>

      {/* 90-Day Predictive Forecasting Section with Confidence Intervals */}
      {forecast && chartData && (
        <div className="glass-panel organic-card rounded-[32px] p-6 md:p-8 mb-6 border border-[#839958]/20 shadow-2xl bg-[#111C16] space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <span className="font-parisienne text-base text-[#F7F4D5] block mb-0.5">
                Predictive Environmental Intelligence
              </span>
              <h3 className="font-yrguma text-xl md:text-2xl font-bold text-white tracking-tight">
                90-Day Holt-Winters Trend Forecast & 95% Confidence Bands
              </h3>
            </div>

            {/* Parameter Selector */}
            <div className="flex bg-[#0D1711] p-1 rounded-xl border border-[#839958]/20">
              <button
                onClick={() => setSelectedParam('dissolved_oxygen_mg_l')}
                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                  selectedParam === 'dissolved_oxygen_mg_l' ? 'bg-[#839958] text-[#0A3323]' : 'text-outline-variant'
                }`}
              >
                Dissolved O₂
              </button>
              <button
                onClick={() => setSelectedParam('turbidity_ntu')}
                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                  selectedParam === 'turbidity_ntu' ? 'bg-[#839958] text-[#0A3323]' : 'text-outline-variant'
                }`}
              >
                Turbidity
              </button>
              <button
                onClick={() => setSelectedParam('ph')}
                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                  selectedParam === 'ph' ? 'bg-[#839958] text-[#0A3323]' : 'text-outline-variant'
                }`}
              >
                pH
              </button>
            </div>
          </div>

          {/* SVG Forecast Graph */}
          <div className="p-4 rounded-2xl bg-[#070E09] border border-[#839958]/20 overflow-x-auto">
            <svg viewBox={`0 0 ${chartData.width} ${chartData.height}`} className="w-full h-48">
              {/* Confidence Band Polygon */}
              {chartData.confidencePolygonD && (
                <path d={chartData.confidencePolygonD} fill="#839958" fillOpacity="0.12" />
              )}

              {/* Historic Line */}
              <path d={chartData.solidD} fill="none" stroke="#839958" strokeWidth="2.5" />

              {/* Projected Line (Dashed) */}
              <path d={chartData.dashedD} fill="none" stroke="#F7F4D5" strokeWidth="2" strokeDasharray="4 4" />

              {/* Points */}
              {chartData.points.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="4" fill="#839958" stroke="#111C16" strokeWidth="2" />
                  {i % 3 === 0 && (
                    <text x={p.x} y={chartData.height - 10} fill="#839958" fontSize="10" textAnchor="middle" opacity="0.8">
                      {p.date}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-4 text-xs font-mono text-outline-variant pt-2 border-t border-[#839958]/15">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-white">
                <span className="h-2 w-4 bg-[#839958] rounded-sm" /> Historic Telemetry
              </span>
              <span className="flex items-center gap-1.5 text-[#F7F4D5]">
                <span className="h-2 w-4 border-t-2 border-dashed border-[#F7F4D5]" /> Projected 90-Day Horizon
              </span>
              <span className="flex items-center gap-1.5 text-[#839958]">
                <span className="h-2.5 w-4 bg-[#839958]/20 rounded-sm" /> 95% Confidence Band
              </span>
            </div>

            <div>
              Projected Status:{' '}
              <strong className="text-white uppercase">{forecast.projected_status_in_90_days}</strong> (Confidence: {(forecast.confidence * 100).toFixed(0)}%)
            </div>
          </div>
        </div>
      )}

      {/* TELEMETRY INGESTION MODAL */}
      {showIngestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-lg w-full glass-panel rounded-3xl p-6 md:p-8 bg-[#111C16] border border-[#839958]/30 shadow-2xl space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-white font-headline-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-[#839958]">sensors</span>
                Ingest Real-Time Sensor Telemetry
              </h3>
              <button onClick={() => setShowIngestModal(false)} className="text-outline-variant hover:text-white cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleIngestTelemetry} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-label-caps text-outline-variant font-bold block mb-1">Dissolved O₂ (mg/L)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={ingestDO}
                    onChange={e => setIngestDO(e.target.value)}
                    className="w-full bg-[#0D1711] border border-[#839958]/25 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-label-caps text-outline-variant font-bold block mb-1">pH Level</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={ingestPH}
                    onChange={e => setIngestPH(e.target.value)}
                    className="w-full bg-[#0D1711] border border-[#839958]/25 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-label-caps text-outline-variant font-bold block mb-1">Turbidity (NTU)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={ingestTurbidity}
                    onChange={e => setIngestTurbidity(e.target.value)}
                    className="w-full bg-[#0D1711] border border-[#839958]/25 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-label-caps text-outline-variant font-bold block mb-1">Water Temp (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={ingestTemp}
                    onChange={e => setIngestTemp(e.target.value)}
                    className="w-full bg-[#0D1711] border border-[#839958]/25 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-label-caps text-outline-variant font-bold block mb-1">Nitrate (mg/L)</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={ingestNitrate}
                  onChange={e => setIngestNitrate(e.target.value)}
                  className="w-full bg-[#0D1711] border border-[#839958]/25 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowIngestModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-outline-variant hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ingesting}
                  className="bg-[#839958] hover:bg-[#97ad6a] text-[#0A3323] px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-md cursor-pointer"
                >
                  {ingesting ? 'Transmitting...' : 'Transmit Telemetry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLIANCE AUDIT REPORT MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-2xl w-full max-h-[85vh] overflow-y-auto glass-panel rounded-3xl p-6 md:p-8 bg-[#111C16] border border-[#839958]/30 shadow-2xl space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-label-caps text-[#839958] font-black uppercase tracking-widest block">
                  OFFICIAL COMPLIANCE REPORT
                </span>
                <h3 className="text-xl font-black text-white font-headline-lg mt-1">
                  {station.name}
                </h3>
              </div>
              <button onClick={() => setShowReportModal(false)} className="text-outline-variant hover:text-white cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {reportLoading ? (
              <div className="py-12 text-center text-xs text-[#839958] animate-pulse">
                Evaluating WHO / EPA / CPCB surface water compliance matrix...
              </div>
            ) : report ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-[#0D1711] border border-[#839958]/20 text-center">
                    <span className="text-[9px] font-label-caps text-outline-variant uppercase block">WQI Score</span>
                    <span className="text-2xl font-black text-white">{report.wqi_score}/100</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#0D1711] border border-[#839958]/20 text-center">
                    <span className="text-[9px] font-label-caps text-outline-variant uppercase block">CPCB Class</span>
                    <span className="text-sm font-black text-[#839958]">{report.cpcb_class}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#0D1711] border border-[#839958]/20 text-center">
                    <span className="text-[9px] font-label-caps text-outline-variant uppercase block">WHO Safe</span>
                    <span className={`text-sm font-black uppercase ${report.who_compliance ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {report.who_compliance ? 'Compliant' : 'Alert'}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#0D1711] border border-[#839958]/15 space-y-2">
                  <span className="text-xs font-bold text-white uppercase font-label-caps block">Auditor Summary</span>
                  <p className="text-xs text-white leading-relaxed">{report.summary}</p>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-white uppercase font-label-caps block">Remediation Directives</span>
                  <ul className="space-y-1">
                    {report.remediation_steps.map((s, i) => (
                      <li key={i} className="text-xs text-outline-variant flex items-start gap-2">
                        <span className="material-symbols-outlined text-sm text-[#839958] mt-0.5">check_circle</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
