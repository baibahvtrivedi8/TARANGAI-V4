import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { Station, WaterQualityStatus, StationAggregateStats } from '../types';
import { fetchStations, fetchGlobalVitality } from '../services/api';
import type { GlobeViewRef } from '../components/GlobeView';

const GlobeView = lazy(() => import('../components/GlobeView'));

interface GlobalViewProps {
  onNavigate: (route: string) => void;
}

const BASIN_PRESETS = [
  { name: 'Ganges', label: '🪔 Ganges Basin', lat: 25.3176, lon: 82.9739, filter: 'Ganges' },
  { name: 'Amazon', label: '🌴 Amazon Basin', lat: -3.4653, lon: -62.2159, filter: 'Amazon' },
  { name: 'Rhine', label: '🏔️ Rhine Basin', lat: 50.9375, lon: 6.9603, filter: 'Rhine' },
  { name: 'Nile', label: '🏺 Nile Basin', lat: 24.0889, lon: 32.8998, filter: 'Nile' },
  { name: 'Danube', label: '🌊 Danube Basin', lat: 48.2082, lon: 16.3738, filter: 'Danube' },
  { name: 'Mississippi', label: '🌾 Mississippi Basin', lat: 30.0, lon: -90.0, filter: 'Mississippi' },
];

export const GlobalView: React.FC<GlobalViewProps> = ({ onNavigate }) => {
  const [stations, setStations] = useState<Station[]>([]);
  const [filteredStations, setFilteredStations] = useState<Station[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [vitalityStats, setVitalityStats] = useState<StationAggregateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerDismissed, setIsDrawerDismissed] = useState(false);
  const [isDrawerMinimized, setIsDrawerMinimized] = useState(false);
  const [activeBasin, setActiveBasin] = useState<string | null>(null);

  const globeRef = useRef<GlobeViewRef>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([fetchStations(), fetchGlobalVitality()])
      .then(([data, stats]) => {
        if (isMounted) {
          setStations(data);
          setFilteredStations(data);
          setVitalityStats(stats);
          if (data.length > 0) setSelectedStationId(data[0].station_id);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          console.error('Failed to load stations', err);
          setError('Failed to sync live stations network');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Filter stations based on search query or basin
  useEffect(() => {
    let result = stations;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.country.toLowerCase().includes(q) ||
        s.source.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q)
      );
    }
    setFilteredStations(result);
  }, [searchQuery, stations]);

  const handleBasinJump = (preset: typeof BASIN_PRESETS[0]) => {
    setActiveBasin(preset.name);
    globeRef.current?.focusCoordinates(preset.lat, preset.lon);
    setSearchQuery(preset.filter);
  };

  const vitality = vitalityStats?.vitality_index || 78.4;
  const meanTemp = vitalityStats?.mean_temperature || 22.8;
  const hypoxiaAlerts = vitalityStats?.hypoxia_alert_count || 2;

  return (
    <div className="relative h-[calc(100vh-72px)] w-full flex overflow-hidden bg-[#0B130E]">
      {/* Left Sidebar: Station Network */}
      <aside className="hidden md:flex flex-col h-full w-80 bg-[#0B130E] border-r border-[#1B2E23] py-5 gap-3 z-40 transition-all duration-300">
        <div className="px-5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-parisienne text-lg text-[#F7F4D5]">Basin Network</span>
          </div>
          <h2 className="font-yrguma text-xl font-bold text-white tracking-tight">
            Global Hydrology
          </h2>
          <p className="font-body-sm text-xs text-outline-variant mt-0.5 font-medium">
            {filteredStations.length} of {stations.length} Telemetry Nodes Active
          </p>

          {/* Search bar inside sidebar */}
          <div className="mt-3 relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-sm pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter nodes, Ganga, Rhine..."
              className="w-full bg-[#121E17] border border-[#839958]/20 focus:border-[#839958] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-outline-variant/60 focus:outline-none focus:ring-1 focus:ring-[#839958]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline-variant hover:text-white"
              >
                <span className="material-symbols-outlined text-xs">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Basin Quick Chips */}
        <div className="px-5 flex flex-wrap gap-1.5">
          {BASIN_PRESETS.slice(0, 4).map(b => (
            <button
              key={b.name}
              onClick={() => handleBasinJump(b)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-label-caps uppercase transition-all cursor-pointer ${
                activeBasin === b.name
                  ? 'bg-[#839958] text-[#0A3323]'
                  : 'bg-[#121E17] text-outline-variant hover:text-white border border-[#839958]/15'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex-grow p-5 space-y-2.5">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-[#121E17] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex-grow overflow-y-auto px-4 space-y-2">
            {filteredStations.map(station => {
              const isSelected = station.station_id === selectedStationId;
              const doReading = station.latest_readings.find(r => r.parameter === 'dissolved_oxygen_mg_l');

              return (
                <div
                  key={station.station_id}
                  onClick={() => {
                    setSelectedStationId(station.station_id);
                    globeRef.current?.focusCoordinates(station.latitude, station.longitude);
                  }}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#162B20] border-[#839958] shadow-lg'
                      : 'bg-[#121E17] border-[#839958]/10 hover:border-[#839958]/30'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-label-caps text-[10px] text-[#839958] font-bold uppercase">
                      {station.source.toUpperCase()}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        station.status === 'excellent' || station.status === 'good'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : station.status === 'moderate'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-red-500/20 text-red-300'
                      }`}
                    >
                      {station.status}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-white line-clamp-1 mb-1">{station.name}</h4>

                  <div className="flex justify-between items-center text-[10px] font-mono text-outline-variant">
                    <span>pH: <strong className="text-white">{station.ph_level || '--'}</strong></span>
                    <span>DO: <strong className="text-white">{doReading ? `${doReading.value} mg/L` : '--'}</strong></span>
                    <span>Pol: <strong className="text-white">{station.pollution_percentage || 20}%</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-auto px-4 pb-4 pt-2 border-t border-[#1B2E23]">
          <button
            onClick={() => onNavigate('/assistant')}
            className="w-full bg-[#839958] hover:bg-[#97ad6a] text-[#0A3323] py-2.5 px-4 rounded-xl font-black flex items-center justify-center gap-2 transition-colors active:scale-95 uppercase text-xs tracking-widest cursor-pointer shadow-lg"
          >
            <span className="material-symbols-outlined text-sm">psychology</span>
            Launch AI Assistant
          </button>
        </div>
      </aside>

      {/* Main Canvas: 3D Globe Visualization */}
      <section className="flex-grow h-full relative bg-forest-deep overflow-hidden min-h-[400px]">
        <Suspense
          fallback={
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#070E09] text-outline-variant gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#839958]/30 border-t-[#839958] animate-spin" />
              <span className="text-xs font-label-caps tracking-wider text-[#839958] uppercase">Loading Planetary Telemetry...</span>
            </div>
          }
        >
          <GlobeView
            ref={globeRef}
            stations={filteredStations}
            onSelectStation={id => onNavigate(`/station/${id}`)}
            activeStationId={selectedStationId || undefined}
          />
        </Suspense>

        {/* Dashboard Overlays */}
        <div className="absolute top-6 left-6 z-20 w-80 space-y-4 pointer-events-auto">
          {/* Floating Info Card */}
          <div className="glass-panel rounded-3xl p-6 organic-card shadow-2xl border border-primary/10 bg-[#111C16]/90 backdrop-blur-md">
            <div className="flex justify-between items-start mb-2">
              <div className="bg-[#1A2D23] px-3 py-1 rounded-full border border-[#839958]/20 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#839958]" />
                <span className="font-parisienne text-sm text-[#F7F4D5]">
                  Telemetry Intelligence
                </span>
              </div>
            </div>

            <h3 className="font-yrguma text-2xl text-white mb-2 font-bold tracking-tight">
              Global Vitality Index
            </h3>

            <div className="flex items-baseline gap-2">
              <span className="font-data-display text-4xl text-[#839958] leading-none font-black tracking-tighter">
                {vitality}
              </span>
              <span className="font-body-sm text-sm text-outline-variant font-bold">/ 100</span>
            </div>

            <div className="mt-4 h-2 w-full bg-[#0D1711] rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full bg-[#839958] transition-all duration-700 rounded-full"
                style={{ width: `${Math.min(100, vitality)}%` }}
              />
            </div>

            <p className="font-body-sm text-xs text-outline-variant mt-4 font-medium">
              Hydrological vitality calculated across <span className="text-white font-bold">{stations.length} monitored nodes</span>.
            </p>
          </div>

          {/* Secondary Data Chip: Mean Surface Temp & Hypoxia Alerts */}
          <div className="glass-panel rounded-2xl p-4 flex items-center justify-between border border-[#839958]/10 shadow-lg bg-[#111C16]/90 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 bg-terracotta-warm/20 rounded-xl flex items-center justify-center text-terracotta-warm">
                <span className="material-symbols-outlined text-lg">thermostat</span>
              </div>
              <div>
                <p className="font-label-caps text-[9px] text-outline-variant uppercase tracking-widest font-black">
                  Mean Water Temp
                </p>
                <p className="font-data-display text-sm text-white font-bold">
                  {meanTemp}°C
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 border-l border-[#839958]/20 pl-3">
              <div className="h-9 w-9 bg-amber-500/20 rounded-xl flex items-center justify-center text-amber-400">
                <span className="material-symbols-outlined text-lg">crisis_alert</span>
              </div>
              <div>
                <p className="font-label-caps text-[9px] text-outline-variant uppercase tracking-widest font-black">
                  Hypoxia Alerts
                </p>
                <p className="font-data-display text-sm text-amber-300 font-bold">
                  {hypoxiaAlerts} Nodes
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Data Bar */}
        {!isDrawerDismissed && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[94%] max-w-3xl pointer-events-auto transition-all">
            {isDrawerMinimized ? (
              <div className="flex justify-center">
                <button
                  onClick={() => setIsDrawerMinimized(false)}
                  className="glass-panel rounded-full px-5 py-2 border border-[#839958]/20 hover:border-[#839958]/40 text-xs font-bold text-[#839958] flex items-center gap-2 shadow-xl cursor-pointer bg-[#111C16]/90 backdrop-blur-md"
                >
                  <span className="material-symbols-outlined text-[#839958] text-base">psychology</span>
                  <span>AI Synthesis & Network Stats</span>
                  <span className="material-symbols-outlined text-sm text-outline-variant">expand_less</span>
                </button>
              </div>
            ) : (
              <div className="glass-panel rounded-2xl p-3.5 organic-card border border-[#839958]/20 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-3 bg-[#111C16]/95 backdrop-blur-xl relative">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-9 w-9 rounded-xl bg-[#1A2D23] border border-[#839958]/30 flex items-center justify-center text-[#839958] flex-shrink-0">
                    <span className="material-symbols-outlined text-lg">psychology</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-label-caps text-[10px] text-[#839958] uppercase font-extrabold tracking-widest">
                        Hydrological Telemetry Engine
                      </span>
                      <span className="text-[10px] text-outline-variant">• {stations.length} Verified Nodes</span>
                    </div>
                    <p className="text-xs text-white font-medium italic truncate max-w-md">
                      "Dissolved Oxygen ratios and WQI calculations running live across global basins."
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onNavigate(selectedStationId ? `/station/${selectedStationId}` : '/assistant')}
                    className="bg-[#839958] hover:bg-[#97ad6a] text-[#0A3323] rounded-full px-4 py-2 text-xs font-black transition-all active:scale-95 shadow flex items-center gap-1 uppercase tracking-wider cursor-pointer"
                  >
                    Inspect Node
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>

                  <div className="flex items-center gap-0.5 border-l border-[#839958]/20 pl-2">
                    <button
                      onClick={() => setIsDrawerMinimized(true)}
                      title="Minimize Bar"
                      className="text-outline-variant hover:text-white p-1 rounded-full hover:bg-[#1A2D23] transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">remove</span>
                    </button>
                    <button
                      onClick={() => setIsDrawerDismissed(true)}
                      title="Remove / Close Bar"
                      className="text-outline-variant hover:text-white p-1 rounded-full hover:bg-[#1A2D23] transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3D Globe Navigation Controls */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3 pointer-events-auto">
          <button
            onClick={() => globeRef.current?.toggleLayers()}
            title="Toggle Grid Layers"
            className="h-11 w-11 bg-[#111C16] border border-[#839958]/20 rounded-full flex items-center justify-center hover:bg-[#839958] hover:text-[#0A3323] text-white transition-all shadow-md cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined">layers</span>
          </button>

          <button
            onClick={() => globeRef.current?.zoomIn()}
            title="Zoom In"
            className="h-11 w-11 bg-[#111C16] border border-[#839958]/20 rounded-full flex items-center justify-center hover:bg-[#839958] hover:text-[#0A3323] text-white transition-all shadow-md cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined">add</span>
          </button>

          <button
            onClick={() => globeRef.current?.zoomOut()}
            title="Zoom Out"
            className="h-11 w-11 bg-[#111C16] border border-[#839958]/20 rounded-full flex items-center justify-center hover:bg-[#839958] hover:text-[#0A3323] text-white transition-all shadow-md cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined">remove</span>
          </button>

          <button
            onClick={() => globeRef.current?.resetRotation()}
            title="Reset Rotation"
            className="h-11 w-11 bg-[#111C16] border border-[#839958]/20 rounded-full flex items-center justify-center hover:bg-[#839958] hover:text-[#0A3323] text-white transition-all shadow-md cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined">explore</span>
          </button>
        </div>
      </section>
    </div>
  );
};
