import React, { useEffect, useState, useRef } from 'react';
import { Station, SearchResponse, RiverHealthAssessment, RiverSuggestion, ComplianceReport } from '../types';
import { searchStations, fetchSuggestions, fetchStationReport } from '../services/api';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  queryText?: string;
  summaryText?: string;
  matchedStations?: Station[];
  riverHealth?: RiverHealthAssessment;
  parsedFilter?: any;
  timestamp: string;
}

interface AiAssistantProps {
  initialQuery?: string;
  onNavigate: (route: string) => void;
}

const DEFAULT_RECENT_QUERIES = [
  'Analyze Ganges River water health & WQI',
  'Ganges River Sangam Basin - Prayagraj',
  'Ganges River Basin Node - Haridwar',
  'Ganges River Basin Node - Patna',
  'Amazon & Nile river baseline telemetry',
  'Rhine River micro-pollutants & DO levels',
];

const GANGA_BASIN_NODES = [
  { label: '🏔️ Rishikesh', query: 'Ganges River Basin Node - Rishikesh' },
  { label: '🛕 Haridwar', query: 'Ganges River Basin Node - Haridwar' },
  { label: '🏭 Kanpur', query: 'Ganges River Industrial Basin - Kanpur' },
  { label: '🌊 Prayagraj (Sangam)', query: 'Ganges River Sangam Basin - Prayagraj' },
  { label: '🪔 Varanasi', query: 'Ganges River Observatory - Varanasi' },
  { label: '📍 Patna', query: 'Ganges River Basin Node - Patna' },
  { label: '🌴 Kolkata Delta', query: 'Ganges River Hooghly Delta - Kolkata' },
];

export const AiAssistant: React.FC<AiAssistantProps> = ({ initialQuery = '', onNavigate }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>(DEFAULT_RECENT_QUERIES);

  // Workspace Mode
  const [assistantMode, setAssistantMode] = useState<'chat' | 'compliance_report'>('chat');

  // Report Generator State
  const [reportStationId, setReportStationId] = useState('cpcb-ganga-varanasi');
  const [generatedReport, setGeneratedReport] = useState<ComplianceReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<RiverSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initial welcome message
  useEffect(() => {
    setMessages([
      {
        id: 'msg-welcome',
        sender: 'assistant',
        summaryText:
          'Welcome to **TARANG AI — HydroWatch Intelligence Engine**. I provide real-time water quality assessments, WQI calculations, hypoxia risk diagnostics, pollutant tracking, and compliance evaluations across global rivers and the Ganges River basin (Haridwar, Kanpur, Prayagraj, Varanasi, Patna).',
        matchedStations: [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    if (initialQuery) {
      handleSendQuery(initialQuery);
    }
  }, [initialQuery]);

  // Fetch dynamic suggestions on typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputText.trim()) {
        fetchSuggestions(inputText).then(data => {
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
        });
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [inputText]);

  // Hide suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSendQuery = async (queryText: string) => {
    if (!queryText.trim() || loading) return;

    setShowSuggestions(false);

    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    if (!recentQueries.includes(queryText)) {
      setRecentQueries(prev => [queryText, ...prev.slice(0, 9)]);
    }

    try {
      const response: SearchResponse = await searchStations(queryText);

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        summaryText: response.ai_summary || response.conversational_reply || 'Analysis completed successfully.',
        matchedStations: response.results || [],
        riverHealth: response.river_health,
        parsedFilter: response.parsed_filter,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      console.error('Search API query failed', err);
      setMessages(prev => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: 'assistant',
          summaryText:
            'I experienced a network glitch, but I am ready to help! Please feel free to re-submit your question or river query.',
          matchedStations: [],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportLoading(true);
    try {
      const rep = await fetchStationReport(reportStationId, 'TARANG AI Environmental Intelligence');
      setGeneratedReport(rep);
    } catch (err) {
      alert('Failed to generate report');
    } finally {
      setReportLoading(false);
    }
  };

  const getWqiColor = (wqi: number) => {
    if (wqi >= 85) return 'text-primary border-primary bg-primary/10';
    if (wqi >= 70) return 'text-secondary border-secondary bg-secondary/10';
    if (wqi >= 55) return 'text-tertiary border-tertiary bg-tertiary/10';
    if (wqi >= 35) return 'text-amber-400 border-amber-400 bg-amber-400/10';
    return 'text-error border-error bg-error/10';
  };

  const renderFormattedText = (text?: string) => {
    if (!text) return null;
    if (text.includes('```')) {
      const parts = text.split(/(```[\s\S]*?```)/g);
      return (
        <div className="space-y-3">
          {parts.map((part, i) => {
            if (part.startsWith('```')) {
              const raw = part.slice(3, -3).trim();
              const lines = raw.split('\n');
              const firstLine = lines[0].trim();
              const isLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
              const lang = isLang ? firstLine : '';
              const codeContent = isLang ? lines.slice(1).join('\n') : raw;
              return (
                <div key={i} className="my-3 rounded-xl overflow-hidden border border-[#839958]/30 bg-[#070E09]">
                  {lang && (
                    <div className="px-3 py-1 bg-[#121E17] text-[10px] font-mono text-[#839958] border-b border-[#839958]/20 flex justify-between items-center">
                      <span>{lang.toUpperCase()} CODE</span>
                    </div>
                  )}
                  <pre className="p-4 text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed whitespace-pre">
                    {codeContent}
                  </pre>
                </div>
              );
            }
            return (
              <p key={i} className="whitespace-pre-line leading-relaxed">
                {part}
              </p>
            );
          })}
        </div>
      );
    }
    return <p className="whitespace-pre-line leading-relaxed">{text}</p>;
  };

  return (
    <div className="h-[calc(100vh-72px)] w-full flex overflow-hidden bg-[#0B130E]">
      {/* Left Sidebar: Ganga Basin Nodes & Quick Workspaces */}
      <aside className="hidden lg:flex flex-col h-full w-80 bg-[#0B130E] border-r border-[#1B2E23] py-5 px-4 gap-4 z-40">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[#839958] text-xl">psychology</span>
            <h2 className="font-headline-lg text-base font-black text-white editorial-wide uppercase tracking-wider">
              AI Workspaces
            </h2>
          </div>
          <p className="font-body-sm text-xs text-outline-variant font-medium">
            Select specialized analysis mode
          </p>
        </div>

        {/* Mode Buttons */}
        <div className="grid grid-cols-1 gap-1.5 border-b border-[#1B2E23] pb-3">
          <button
            onClick={() => setAssistantMode('chat')}
            className={`text-left px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer font-bold ${
              assistantMode === 'chat'
                ? 'bg-[#839958] text-[#0A3323] shadow-md'
                : 'text-white bg-[#121E17] hover:bg-[#162B20] border border-[#839958]/15'
            }`}
          >
            <span className="material-symbols-outlined text-base">forum</span>
            Chat & Hydrology Analysis
          </button>

          <button
            onClick={() => setAssistantMode('compliance_report')}
            className={`text-left px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer font-bold ${
              assistantMode === 'compliance_report'
                ? 'bg-[#839958] text-[#0A3323] shadow-md'
                : 'text-white bg-[#121E17] hover:bg-[#162B20] border border-[#839958]/15'
            }`}
          >
            <span className="material-symbols-outlined text-base">assignment</span>
            Compliance Report Generator
          </button>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[#839958] text-base">water_drop</span>
            <h3 className="font-headline-lg text-xs font-bold text-white uppercase tracking-wider font-label-caps">
              Ganga Basin City Nodes
            </h3>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 overflow-y-auto max-h-44 pr-1 border-b border-[#1B2E23] pb-3">
          {GANGA_BASIN_NODES.map((node, idx) => (
            <button
              key={idx}
              onClick={() => {
                setAssistantMode('chat');
                handleSendQuery(node.query);
              }}
              className="text-left px-3 py-1.5 rounded-xl text-xs text-white hover:bg-[#162B20] border border-[#839958]/15 bg-[#121E17] transition-all flex items-center justify-between group cursor-pointer"
            >
              <span className="font-medium">{node.label}</span>
              <span className="material-symbols-outlined text-xs text-[#839958] opacity-60 group-hover:opacity-100">
                arrow_forward
              </span>
            </button>
          ))}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[#839958] text-base">history</span>
            <h3 className="font-headline-lg text-xs font-bold text-white uppercase tracking-wider font-label-caps">
              Recent Queries
            </h3>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 overflow-y-auto flex-grow pr-1">
          {recentQueries.map((query, idx) => (
            <div
              key={idx}
              onClick={() => {
                setAssistantMode('chat');
                handleSendQuery(query);
              }}
              className="rounded-xl p-2 text-xs text-white hover:border-[#839958]/40 border border-[#839958]/15 bg-[#121E17] cursor-pointer transition-all active:scale-98 flex items-center gap-2 group"
            >
              <span className="material-symbols-outlined text-xs text-[#839958] flex-shrink-0">
                chat_bubble
              </span>
              <span className="font-body-sm line-clamp-1 font-medium text-[11px]">{query}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Analysis Center */}
      <main className="flex-grow flex flex-col h-full overflow-hidden bg-[#070E09] relative">
        {/* Mobile / Tablet Workspace Switcher */}
        <div className="lg:hidden flex items-center gap-1.5 p-3 border-b border-[#1B2E23] bg-[#0B130E] overflow-x-auto no-scrollbar">
          <button
            onClick={() => setAssistantMode('chat')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${
              assistantMode === 'chat'
                ? 'bg-[#839958] text-[#0A3323]'
                : 'bg-[#121E17] text-outline-variant hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">forum</span>
            Chat & Analysis
          </button>

          <button
            onClick={() => setAssistantMode('compliance_report')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${
              assistantMode === 'compliance_report'
                ? 'bg-[#839958] text-[#0A3323]'
                : 'bg-[#121E17] text-outline-variant hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">assignment</span>
            Compliance Report
          </button>
        </div>

        {/* VIEW 1: CHAT ASSISTANT & STREAM */}
        {assistantMode === 'chat' && (
          <>
            {/* Messages Stream */}
            <div className="flex-grow overflow-y-auto p-4 md:p-8 space-y-6">
              {messages.map(msg => {
                if (msg.sender === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="bg-[#839958] text-[#0A3323] rounded-2xl rounded-tr-none px-6 py-4 max-w-xl shadow-lg">
                        <p className="font-body-md text-sm md:text-base font-bold">{msg.queryText}</p>
                        <span className="font-label-caps text-[10px] text-[#0A3323]/70 block text-right mt-1 font-bold">
                          {msg.timestamp}
                        </span>
                      </div>
                    </div>
                  );
                }

                const rh = msg.riverHealth;

                return (
                  <div key={msg.id} className="flex items-start gap-3 max-w-4xl">
                    <div className="h-10 w-10 rounded-full bg-[#105666] flex items-center justify-center text-[#F7F4D5] border border-[#839958]/30 flex-shrink-0 mt-1 shadow-md">
                      <span className="material-symbols-outlined text-xl">psychology</span>
                    </div>

                    <div className="flex-grow space-y-4">
                      {/* Executive AI Synthesis / Response Card */}
                      <div className="glass-panel organic-card rounded-[28px] p-6 border border-[#839958]/20 shadow-xl bg-[#111C16]">
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#839958] animate-pulse" />
                            <span className="font-yrguma text-sm font-bold text-[#F7F4D5] tracking-wide">
                              Tarang AI Synthesis
                            </span>
                            <span className="font-label-caps text-[10px] text-[#839958] uppercase font-bold tracking-widest hidden sm:inline">
                              • Hydrological Intelligence
                            </span>
                          </div>
                          <span className="font-label-caps text-[10px] text-outline-variant">
                            {msg.timestamp}
                          </span>
                        </div>

                        <div className="font-body-md text-sm md:text-base text-white leading-relaxed font-medium">
                          {renderFormattedText(msg.summaryText)}
                        </div>
                      </div>

                      {/* Specialized River Health & Telemetry Metrics Card */}
                      {rh && (
                        <div className="glass-panel organic-card rounded-3xl p-6 border border-primary/20 shadow-2xl bg-surface-dim/90 backdrop-blur-md space-y-6">
                          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-primary/10">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-primary text-xl">vital_signs</span>
                              <h4 className="font-headline-lg-mobile text-sm md:text-base font-extrabold text-white uppercase tracking-wider">
                                {rh.is_coordinate_query ? '📍 Coordinate Telemetry & Water Health Diagnosis' : '🌊 Water Quality Index & Chemical Telemetry'}
                              </h4>
                            </div>
                            {rh.detected_coords && (
                              <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-mono">
                                {rh.detected_coords.lat.toFixed(4)}°, {rh.detected_coords.lon.toFixed(4)}°
                              </span>
                            )}
                          </div>

                          {/* Row 1: WQI Score + pH Level Gauge + Pollution Level % */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* WQI Score Meter */}
                            <div className={`rounded-2xl p-4 border flex flex-col items-center justify-center text-center ${getWqiColor(rh.wqi)}`}>
                              <span className="font-label-caps text-[10px] uppercase font-black tracking-widest opacity-80 mb-1">
                                Water Quality Index (WQI)
                              </span>
                              <span className="text-4xl font-black font-headline-lg-mobile">
                                {rh.wqi}<span className="text-sm font-normal">/100</span>
                              </span>
                              <span className="px-3 py-0.5 mt-2 rounded-full text-xs font-black uppercase tracking-wider bg-black/30">
                                {rh.health_rating}
                              </span>
                            </div>

                            {/* pH Level Scale Meter */}
                            <div className="rounded-2xl p-4 bg-surface-container-high/60 border border-primary/20 flex flex-col justify-between">
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-label-caps text-[10px] text-primary uppercase font-bold tracking-widest flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">science</span>
                                    pH Level Scale
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-primary/20 text-primary">
                                    {rh.ph_status}
                                  </span>
                                </div>
                                <div className="flex items-baseline gap-2 my-1">
                                  <span className="text-3xl font-black text-white font-data-display">{rh.ph_level}</span>
                                  <span className="text-xs text-outline-variant font-bold">pH Scale</span>
                                </div>
                                <div className="w-full bg-black/40 h-2.5 rounded-full overflow-hidden relative my-2 border border-white/10">
                                  <div
                                    className="h-full bg-gradient-to-r from-red-500 via-emerald-400 to-purple-600 rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min(100, Math.max(0, (rh.ph_level / 14) * 100))}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-[10px] text-outline-variant font-label-caps block">
                                Permissible Limit: <strong className="text-white">6.5 - 8.5 pH</strong>
                              </span>
                            </div>

                            {/* Water Contamination Level (%) */}
                            <div className="rounded-2xl p-4 bg-surface-container-high/60 border border-primary/20 flex flex-col justify-between">
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-label-caps text-[10px] text-terracotta-warm uppercase font-bold tracking-widest flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">water_damage</span>
                                    Pollution Influx
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-error/20 text-error">
                                    {rh.pollution_percentage}% Degraded
                                  </span>
                                </div>
                                <div className="flex items-baseline gap-2 my-1">
                                  <span className="text-3xl font-black text-white font-data-display">{rh.pollution_percentage}%</span>
                                  <span className="text-xs text-outline-variant font-bold">Total Influx</span>
                                </div>
                                <div className="w-full bg-black/40 h-2.5 rounded-full overflow-hidden my-2 border border-white/10">
                                  <div
                                    className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500 rounded-full"
                                    style={{ width: `${rh.pollution_percentage}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-[10px] text-outline-variant font-label-caps block">
                                Status: <strong className="text-white">{rh.pollution_percentage > 50 ? 'High Chemical Load' : 'Moderate Threshold'}</strong>
                              </span>
                            </div>
                          </div>

                          {/* Row 2: WQI Sub-Indices Breakdown if present */}
                          {rh.sub_indices && rh.sub_indices.length > 0 && (
                            <div className="pt-4 border-t border-primary/10">
                              <h5 className="font-label-caps text-xs text-primary uppercase font-extrabold tracking-wider mb-3 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-base">analytics</span>
                                Multi-Parameter WQI Sub-Index Scoring
                              </h5>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                {rh.sub_indices.map((sub, sIdx) => (
                                  <div key={sIdx} className="p-2.5 rounded-xl bg-black/30 border border-primary/15">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-[10px] font-bold text-outline-variant truncate">{sub.parameter.replace(/_/g, ' ')}</span>
                                      <span className={`h-2 w-2 rounded-full ${sub.status === 'safe' ? 'bg-emerald-400' : sub.status === 'warning' ? 'bg-amber-400' : 'bg-red-400'}`} />
                                    </div>
                                    <span className="text-sm font-black text-white block">{sub.measured_value} <span className="text-[9px] font-normal text-outline-variant">{sub.unit}</span></span>
                                    <span className="text-[9px] text-[#839958] font-mono">Score: {sub.sub_index}/100</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Row 3: Pollutants Present Breakdown */}
                          {rh.pollutants && rh.pollutants.length > 0 && (
                            <div className="pt-4 border-t border-primary/10">
                              <h5 className="font-label-caps text-xs text-primary uppercase font-extrabold tracking-wider mb-3 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-base">warning</span>
                                Identified Chemical & Bio-Pollutants ({rh.pollutants.length})
                              </h5>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {rh.pollutants.map((pollutant, pIdx) => (
                                  <div key={pIdx} className="p-3 rounded-xl bg-black/20 border border-primary/10 hover:border-primary/30 transition-all">
                                    <div className="flex justify-between items-start mb-1">
                                      <span className="text-xs font-bold text-white flex items-center gap-1">
                                        <span className="h-1.5 w-1.5 rounded-full bg-terracotta-warm" />
                                        {pollutant.name}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                        pollutant.severity === 'severe' || pollutant.severity === 'high'
                                          ? 'bg-error/30 text-error border border-error/30'
                                          : 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                                      }`}>
                                        {pollutant.severity} ({pollutant.concentration})
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-outline-variant line-clamp-2 mt-1">
                                      {pollutant.description}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Row 4: Connected Sewer Networks & Outfall Drains */}
                          {rh.connected_sewers && rh.connected_sewers.length > 0 && (
                            <div className="pt-4 border-t border-primary/10">
                              <h5 className="font-label-caps text-xs text-secondary uppercase font-extrabold tracking-wider mb-3 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-base">alt_route</span>
                                Connected Sewer Outfall Networks & Discharge Drains ({rh.connected_sewers.length})
                              </h5>
                              <div className="space-y-2">
                                {rh.connected_sewers.map((sewer) => (
                                  <div key={sewer.id} className="p-3 rounded-xl bg-surface-container-high/40 border border-secondary/15 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                      <div className="h-8 w-8 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary text-sm">
                                        <span className="material-symbols-outlined text-base">
                                          {sewer.type === 'industrial' ? 'factory' : sewer.type === 'municipal' ? 'domain' : sewer.type === 'stormwater' ? 'rainy' : 'agriculture'}
                                        </span>
                                      </div>
                                      <div>
                                        <h6 className="text-xs font-bold text-white">{sewer.name}</h6>
                                        <span className="text-[10px] text-outline-variant font-mono">
                                          Distance: {sewer.connected_distance_km}km • Flow Rate: {sewer.discharge_rate_m3_s} m³/s
                                        </span>
                                      </div>
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                                      sewer.treatment_status === 'untreated'
                                        ? 'bg-error/20 text-error border border-error/30'
                                        : sewer.treatment_status === 'partially_treated'
                                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                                        : 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                                    }`}>
                                      {sewer.treatment_status.replace('_', ' ')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Primary Stressor & AI Strategy */}
                          <div className="p-4 rounded-2xl bg-surface-container-high/70 border border-primary/15">
                            <div className="mb-2">
                              <span className="font-label-caps text-[10px] text-primary uppercase font-bold tracking-widest block mb-1">
                                Primary Environmental Stressor
                              </span>
                              <p className="text-xs md:text-sm text-on-surface font-semibold">
                                {rh.primary_stressor}
                              </p>
                            </div>
                            <div className="pt-2 border-t border-primary/10">
                              <span className="font-label-caps text-[10px] text-secondary uppercase font-bold tracking-widest block mb-1">
                                Recommended Remediation Strategy
                              </span>
                              <p className="text-xs text-outline-variant font-medium">
                                {rh.recommended_action}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Matching Stations Cards */}
                      {msg.matchedStations && msg.matchedStations.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center px-1">
                            <span className="font-label-caps text-xs text-outline-variant uppercase font-bold">
                              Matched Hydrological Monitoring Nodes ({msg.matchedStations.length})
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {msg.matchedStations.map(station => (
                              <div
                                key={station.station_id}
                                onClick={() => onNavigate(`/station/${station.station_id}`)}
                                className="glass-panel organic-card rounded-2xl p-5 border border-primary/10 hover:border-primary/40 shadow-lg cursor-pointer transition-all active:scale-98 flex flex-col justify-between group"
                              >
                                <div>
                                  <div className="flex justify-between items-start mb-2">
                                    <span className="font-label-caps text-[10px] text-primary uppercase font-bold">
                                      {station.source.toUpperCase()} • {station.water_body_type}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase text-black bg-secondary">
                                      {station.status}
                                    </span>
                                  </div>

                                  <h4 className="font-headline-lg-mobile text-base text-white font-bold group-hover:text-primary transition-colors mb-2">
                                    {station.name}
                                  </h4>

                                  <div className="grid grid-cols-3 gap-2 text-xs font-label-caps border-t border-primary/10 pt-3 mt-2">
                                    <div>
                                      <span className="text-outline-variant block">pH Level:</span>
                                      <span className="text-white font-bold">{station.ph_level || '--'}</span>
                                    </div>
                                    <div>
                                      <span className="text-outline-variant block font-black text-amber-300">Pollution:</span>
                                      <span className="text-white font-bold">{station.pollution_percentage || 20}%</span>
                                    </div>
                                    <div>
                                      <span className="text-outline-variant block">Dissolved O₂:</span>
                                      <span className="text-white font-bold">
                                        {station.latest_readings.find(r => r.parameter === 'dissolved_oxygen_mg_l')?.value || '--'} mg/L
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 text-right">
                                  <span className="font-label-caps text-[11px] text-primary font-bold flex items-center justify-end gap-1 group-hover:underline">
                                    Inspect Node Telemetry
                                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex items-center gap-3 max-w-md">
                  <div className="h-10 w-10 rounded-2xl bg-[#1A2D23] flex items-center justify-center text-[#839958] border border-[#839958]/30">
                    <span className="material-symbols-outlined text-xl">psychology</span>
                  </div>
                  <div className="glass-panel rounded-2xl p-4 text-xs font-label-caps text-[#839958] border border-[#839958]/20">
                    Executing hydrological intelligence query...
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Input Field Box */}
            <div className="p-4 md:p-6 bg-[#070E09] border-t border-[#1B2E23] relative" ref={dropdownRef}>
              {/* Floating Autocomplete Overlay */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute bottom-full mb-2 left-4 right-4 md:left-6 md:right-6 max-w-4xl mx-auto glass-panel rounded-2xl border border-[#839958]/30 shadow-2xl overflow-hidden z-50 bg-[#0B130E]/95 backdrop-blur-xl">
                  <div className="px-4 py-2 bg-[#121E17] border-b border-[#839958]/15 flex justify-between items-center">
                    <span className="font-label-caps text-[10px] text-[#839958] uppercase font-bold tracking-widest flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">search_spark</span>
                      River & Coordinate Suggestions
                    </span>
                    <span className="text-[10px] text-outline-variant">Select or press Enter</span>
                  </div>

                  <div className="max-h-60 overflow-y-auto divide-y divide-[#839958]/10">
                    {suggestions.map(sug => (
                      <div
                        key={sug.id}
                        onClick={() => {
                          setInputText(sug.title.replace(/^📍 Coordinates \(/, '').replace(/\)$/, ''));
                          handleSendQuery(sug.type === 'coordinate' ? `${sug.lat}, ${sug.lon}` : sug.title);
                        }}
                        className="p-3 hover:bg-[#162B20] cursor-pointer transition-colors flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="h-8 w-8 rounded-xl bg-[#1A2D23] border border-[#839958]/20 flex items-center justify-center text-[#839958] text-sm flex-shrink-0">
                            <span className="material-symbols-outlined">
                              {sug.type === 'coordinate' ? 'location_on' : sug.type === 'river' ? 'water' : 'sensors'}
                            </span>
                          </span>
                          <div>
                            <h5 className="text-xs md:text-sm font-bold text-white group-hover:text-[#F7F4D5] transition-colors">
                              {sug.title}
                            </h5>
                            <p className="text-[11px] text-outline-variant line-clamp-1">{sug.subtitle}</p>
                          </div>
                        </div>
                        {sug.status && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-[#839958] text-[#0A3323]">
                            {sug.status}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleSendQuery(inputText);
                }}
                className="max-w-4xl mx-auto relative flex items-center"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  placeholder="Ask about water quality, WQI, hypoxia risks, or search river basins (e.g. Ganges, Haridwar, Varanasi, Amazon)..."
                  className="w-full bg-[#121E17] border border-[#839958]/25 focus:border-[#839958] rounded-2xl py-4 pl-5 pr-14 text-sm text-white placeholder:text-outline-variant/60 focus:outline-none focus:ring-1 focus:ring-[#839958] shadow-xl font-body-md"
                />
                <button
                  type="submit"
                  disabled={loading || !inputText.trim()}
                  className="absolute right-2 bg-[#1A2D23] hover:bg-[#839958] text-[#839958] hover:text-[#0A3323] border border-[#839958]/30 p-2.5 rounded-xl disabled:opacity-40 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-xl font-bold">send</span>
                </button>
              </form>
            </div>
          </>
        )}

        {/* VIEW 2: AUTOMATED COMPLIANCE REPORT GENERATOR */}
        {assistantMode === 'compliance_report' && (
          <div className="flex-grow overflow-y-auto p-4 md:p-8 space-y-6 max-w-4xl mx-auto w-full">
            <div className="glass-panel organic-card rounded-3xl p-6 border border-[#839958]/25 bg-[#111C16] space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-[#1A2D23] flex items-center justify-center text-[#839958] border border-[#839958]/40">
                  <span className="material-symbols-outlined text-2xl">assignment</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-white font-headline-lg uppercase">
                    Environmental Compliance Report Generator
                  </h3>
                  <p className="text-xs text-outline-variant">
                    Generate regulatory compliance assessments under CPCB, WHO, and EPA surface water criteria
                  </p>
                </div>
              </div>

              <form onSubmit={handleGenerateReport} className="flex flex-col sm:flex-row gap-3 pt-2">
                <select
                  value={reportStationId}
                  onChange={e => setReportStationId(e.target.value)}
                  className="flex-grow bg-[#121E17] border border-[#839958]/25 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#839958]"
                >
                  <option value="cpcb-ganga-varanasi">Ganges River Observatory - Varanasi</option>
                  <option value="cpcb-ganga-prayagraj">Ganges River Sangam Basin - Prayagraj</option>
                  <option value="cpcb-ganga-haridwar">Ganges River Basin Node - Haridwar</option>
                  <option value="cpcb-ganga-kanpur">Ganges River Industrial Basin - Kanpur</option>
                  <option value="gemstat-amazon-03">Amazon River Node (GEMStat)</option>
                  <option value="eea-rhine-07">Rhine River Monitoring Node (EEA)</option>
                </select>

                <button
                  type="submit"
                  disabled={reportLoading}
                  className="bg-[#839958] hover:bg-[#97ad6a] text-[#0A3323] px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2 whitespace-nowrap shadow-md"
                >
                  {reportLoading ? 'Analyzing...' : 'Generate Official Report'}
                </button>
              </form>
            </div>

            {/* Generated Report Card */}
            {generatedReport && (
              <div className="glass-panel organic-card rounded-3xl p-6 md:p-8 border border-[#839958]/30 bg-[#111C16] shadow-2xl space-y-6 animate-in fade-in duration-300">
                <div className="flex flex-wrap justify-between items-start gap-4 pb-4 border-b border-[#839958]/20">
                  <div>
                    <span className="font-label-caps text-[10px] text-[#839958] uppercase tracking-widest font-black block">
                      OFFICIAL ENVIRONMENTAL COMPLIANCE AUDIT
                    </span>
                    <h2 className="text-xl font-black text-white font-headline-lg mt-1">
                      {generatedReport.station_name}
                    </h2>
                    <span className="text-[11px] font-mono text-outline-variant">
                      Audit ID: {generatedReport.id} • {new Date(generatedReport.generated_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="px-4 py-1.5 rounded-full text-xs font-black uppercase bg-[#839958] text-[#0A3323]">
                      CPCB {generatedReport.cpcb_class}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-[#0D1711] border border-[#839958]/20 text-center">
                    <span className="text-[10px] font-label-caps text-outline-variant uppercase font-bold block mb-1">
                      WQI Health Score
                    </span>
                    <span className="text-3xl font-black text-white font-headline-lg">
                      {generatedReport.wqi_score}<span className="text-sm font-normal">/100</span>
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#0D1711] border border-[#839958]/20 text-center">
                    <span className="text-[10px] font-label-caps text-outline-variant uppercase font-bold block mb-1">
                      WHO Standard
                    </span>
                    <span className={`text-sm font-black uppercase ${generatedReport.who_compliance ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {generatedReport.who_compliance ? 'Compliant' : 'Exceedances Detected'}
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#0D1711] border border-[#839958]/20 text-center">
                    <span className="text-[10px] font-label-caps text-outline-variant uppercase font-bold block mb-1">
                      EPA Criteria
                    </span>
                    <span className={`text-sm font-black uppercase ${generatedReport.epa_compliance ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {generatedReport.epa_compliance ? 'Compliant' : 'Mitigation Required'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-white uppercase font-label-caps">
                    Identified Parameter Exceedances
                  </h4>
                  <ul className="space-y-1.5">
                    {generatedReport.primary_exceedances.map((exc, idx) => (
                      <li key={idx} className="text-xs text-amber-300 flex items-start gap-2 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                        <span className="material-symbols-outlined text-sm mt-0.5">warning</span>
                        <span>{exc}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-white uppercase font-label-caps">
                    Mandated AI Remediation Steps
                  </h4>
                  <ul className="space-y-1.5">
                    {generatedReport.remediation_steps.map((step, idx) => (
                      <li key={idx} className="text-xs text-outline-variant flex items-start gap-2 bg-[#0D1711] p-2.5 rounded-xl border border-[#839958]/15">
                        <span className="material-symbols-outlined text-sm text-[#839958] mt-0.5">check_circle</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-[#0D1711] border border-[#839958]/20">
                  <p className="text-xs text-white leading-relaxed font-medium">
                    {generatedReport.summary}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
