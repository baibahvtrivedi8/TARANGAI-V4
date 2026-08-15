import React, { useState, useEffect, useRef } from 'react';
import { INITIAL_STATIONS, createDynamicRiverStation } from '../data/mockStations';
import { Station } from '../types';
import { TarangLogo } from './TarangLogo';

interface HeaderProps {
  currentRoute: string; // '/' | '/station' | '/assistant'
  onNavigate: (route: string) => void;
}

const QUICK_SUGGESTIONS = [
  'Nile River',
  'Rhine River',
  'River Thames',
  'River Seine',
  'Yangtze River',
  'Severe Hypoxia Alerts',
  'High Turbidity Stations',
];

export const Header: React.FC<HeaderProps> = ({ currentRoute, onNavigate }) => {
  const [searchInput, setSearchInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [matchedResults, setMatchedResults] = useState<Station[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('tarang_user_email');
    setUserEmail(saved);
  }, [currentRoute]);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut listener: "/" to focus search bar, "Escape" to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setIsFocused(false);
        setIsMobileSearchOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter matched results dynamically as user types
  useEffect(() => {
    const query = searchInput.trim().toLowerCase();
    if (!query) {
      setMatchedResults(INITIAL_STATIONS.slice(0, 5));
      return;
    }

    let results = INITIAL_STATIONS.filter(
      s =>
        s.name.toLowerCase().includes(query) ||
        s.country.toLowerCase().includes(query) ||
        s.water_body_type.toLowerCase().includes(query) ||
        s.status.toLowerCase().includes(query)
    );

    // If no static match or specific river query, generate dynamic station preview
    if (results.length === 0 && query.length > 2) {
      results = [createDynamicRiverStation(searchInput)];
    } else if (query.length > 2 && !results.some(r => r.name.toLowerCase().includes(query))) {
      results = [createDynamicRiverStation(searchInput), ...results];
    }

    setMatchedResults(results.slice(0, 5));
  }, [searchInput]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setIsFocused(false);
      setIsMobileSearchOpen(false);
      onNavigate(`/assistant?q=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  const handleSelectSuggestion = (queryText: string) => {
    setSearchInput(queryText);
    setIsFocused(false);
    setIsMobileSearchOpen(false);
    onNavigate(`/assistant?q=${encodeURIComponent(queryText)}`);
  };

  const handleSelectStation = (stationId: string) => {
    setIsFocused(false);
    setIsMobileSearchOpen(false);
    onNavigate(`/station/${stationId}`);
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0B130E]/95 backdrop-blur-2xl border-b border-[#839958]/20 px-4 md:px-margin-desktop py-2.5 flex items-center justify-between transition-all">
      {/* Brand Logo & Name */}
      <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onNavigate('/')}>
        <TarangLogo size="sm" showTagline={false} showAiSubtitle={false} />
        <div className="flex flex-col -ml-1">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="font-yrguma text-lg md:text-xl font-black text-[#F7F4D5] tracking-wider">
              TARANG
            </span>
            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-[#1A2D23] border border-[#839958]/40 text-[#839958]">
              AI
            </span>
          </div>
          <span className="font-label-caps text-[8px] md:text-[9px] text-[#839958] tracking-widest uppercase mt-0.5 font-semibold">
            HydroWatch Engine
          </span>
        </div>
      </div>

      {/* Main Navigation Links */}
      <nav class="hidden lg:flex items-center gap-6">
        <button
          onClick={() => onNavigate('/')}
          class={`font-body-md text-sm font-medium transition-all cursor-pointer py-1 ${
            currentRoute === '/'
              ? 'text-white font-bold border-b-2 border-[#839958]'
              : 'text-outline-variant hover:text-white'
          }`}
        >
          Dashboard
        </button>

        <button
          onClick={() => onNavigate('/station/gemstat-amazon-03')}
          class={`font-body-md text-sm font-medium transition-all cursor-pointer py-1 ${
            currentRoute.startsWith('/station')
              ? 'text-white font-bold border-b-2 border-[#839958]'
              : 'text-outline-variant hover:text-white'
          }`}
        >
          Stations
        </button>

        <button
          onClick={() => onNavigate('/assistant')}
          class={`font-body-md text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5 py-1 ${
            currentRoute === '/assistant'
              ? 'text-white font-bold border-b-2 border-[#839958]'
              : 'text-outline-variant hover:text-white'
          }`}
        >
          <span class="material-symbols-outlined text-base">psychology</span>
          AI Assistant
        </button>

        <button
          onClick={() => onNavigate('/about')}
          class={`font-body-md text-sm font-medium transition-all cursor-pointer py-1 ${
            currentRoute === '/about'
              ? 'text-white font-bold border-b-2 border-[#839958]'
              : 'text-outline-variant hover:text-white'
          }`}
        >
          About
        </button>

        <button
          onClick={() => onNavigate('/login')}
          class={`font-body-md text-sm font-medium transition-all cursor-pointer py-1 ${
            currentRoute === '/login'
              ? 'text-white font-bold border-b-2 border-[#839958]'
              : 'text-outline-variant hover:text-white'
          }`}
        >
          Account
        </button>
      </nav>

      {/* Prominent Global Top Search Bar */}
      <div class="relative hidden sm:block flex-1 max-w-md mx-4 lg:mx-8">
        <form onSubmit={handleSearchSubmit} class="relative w-full">
          <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline-variant text-lg pointer-events-none">
            search
          </span>

          <input
            ref={inputRef}
            type="text"
            value={searchInput}
            onFocus={() => setIsFocused(true)}
            onChange={e => {
              setSearchInput(e.target.value);
              setIsFocused(true);
            }}
            placeholder="Search any river, basin, or station globally..."
            class="w-full bg-[#121E17] border border-[#839958]/20 focus:border-[#839958] rounded-full pl-10 pr-16 py-2 text-xs md:text-sm text-white placeholder:text-outline-variant/70 focus:outline-none focus:ring-1 focus:ring-[#839958]/40 shadow-inner transition-all"
          />

          <div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchInput ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  inputRef.current?.focus();
                }}
                class="text-outline-variant hover:text-white text-xs cursor-pointer p-0.5"
              >
                <span class="material-symbols-outlined text-sm">cancel</span>
              </button>
            ) : (
              <kbd class="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-mono text-outline-variant bg-[#1A2B21] rounded border border-[#839958]/10">
                /
              </kbd>
            )}
          </div>
        </form>

        {/* Live Search Autocomplete & Quick Suggestions Dropdown */}
        {isFocused && (
          <div
            ref={dropdownRef}
            class="absolute left-0 right-0 top-full mt-2 bg-[#0B130E]/95 backdrop-blur-xl border border-[#839958]/30 rounded-2xl p-4 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            {/* Ask AI Prompt Highlight */}
            {searchInput.trim() && (
              <div
                onClick={() => handleSelectSuggestion(searchInput)}
                class="glass-panel rounded-xl p-3 mb-3 border border-[#839958]/30 hover:bg-[#839958]/20 cursor-pointer transition-all flex items-center justify-between group"
              >
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[#839958] text-base">psychology</span>
                  <span class="text-xs font-bold text-white">
                    Ask TARANG AI to analyze <span class="text-[#F7F4D5] italic">"{searchInput}"</span>
                  </span>
                </div>
                <span class="material-symbols-outlined text-[#839958] text-sm group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </div>
            )}

            {/* Instant Matched Rivers / Stations */}
            <div>
              <div class="flex items-center justify-between mb-2 px-1">
                <span class="font-label-caps text-[10px] text-outline-variant uppercase font-bold tracking-wider">
                  {searchInput.trim() ? 'Matched Rivers & Stations' : 'Global Water Nodes'}
                </span>
                <span class="font-label-caps text-[9px] text-[#839958]">Live Telemetry</span>
              </div>

              <div class="space-y-1.5 max-h-56 overflow-y-auto">
                {matchedResults.map(station => (
                  <div
                    key={station.station_id}
                    onClick={() => handleSelectStation(station.station_id)}
                    class="p-2.5 rounded-xl hover:bg-[#162B20] cursor-pointer transition-all flex items-center justify-between group border border-transparent hover:border-[#839958]/30"
                  >
                    <div class="flex items-center gap-2.5 min-w-0 pr-2">
                      <span
                        class={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                          station.status === 'excellent'
                            ? 'bg-[#F7F4D5]'
                            : station.status === 'good'
                            ? 'bg-[#839958]'
                            : station.status === 'moderate'
                            ? 'bg-amber-400'
                            : station.status === 'poor'
                            ? 'bg-[#D3968C]'
                            : 'bg-red-400'
                        }`}
                      />
                      <div class="min-w-0">
                        <p class="text-xs font-semibold text-white group-hover:text-[#F7F4D5] transition-colors truncate">
                          {station.name}
                        </p>
                        <p class="text-[10px] text-outline-variant truncate">
                          {station.country} • {station.water_body_type.toUpperCase()}
                        </p>
                      </div>
                    </div>

                    <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#1A2B21] text-[#C2D1B2] border border-[#839958]/10">
                      {station.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Filter Chips */}
            <div class="mt-3 pt-3 border-t border-[#1B2E23]">
              <span class="font-label-caps text-[10px] text-outline-variant uppercase font-bold tracking-wider block mb-2 px-1">
                Popular Searches
              </span>
              <div class="flex flex-wrap gap-1.5">
                {QUICK_SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSuggestion(suggestion)}
                    class="text-[11px] font-medium bg-[#16241C] text-[#C2D1B2] hover:text-white hover:bg-[#839958]/20 border border-[#839958]/20 rounded-full px-3 py-1 cursor-pointer transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Header Controls */}
      <div class="flex items-center gap-2 sm:gap-3">
        {/* Mobile Search Button Toggle */}
        <button
          onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
          class="sm:hidden text-outline-variant hover:text-white cursor-pointer p-2 rounded-full hover:bg-[#162B20] transition-colors"
          title="Search"
        >
          <span class="material-symbols-outlined">search</span>
        </button>

        <button
          onClick={() => onNavigate('/assistant')}
          class="text-outline-variant hover:text-white cursor-pointer p-2 rounded-full hover:bg-[#162B20] transition-colors flex items-center justify-center"
          title="AI Assistant"
        >
          <span class="material-symbols-outlined">psychology</span>
        </button>

        <button
          onClick={() => onNavigate('/login')}
          class="flex items-center gap-2 bg-[#121E17] hover:bg-[#1B2E23] text-white border border-[#839958]/30 px-3.5 py-1.5 rounded-full text-xs font-bold font-mono tracking-wider transition-all cursor-pointer"
          title={userEmail ? `Logged in as ${userEmail}` : 'Account'}
        >
          <div class="h-5 w-5 rounded-full bg-[#1B2E23] border border-[#839958]/40 flex items-center justify-center text-white text-xs">
            <span class="material-symbols-outlined text-xs">account_circle</span>
          </div>
          <span class="max-w-[120px] truncate">
            {userEmail ? userEmail.split('@')[0].toUpperCase() : 'CBCDIJVBLSDJB'}
          </span>
        </button>
      </div>

      {/* Mobile Top Search Overlay Drawer */}
      {isMobileSearchOpen && (
        <div class="sm:hidden fixed inset-x-0 top-0 z-50 bg-forest-deep/98 p-4 border-b border-primary/20 shadow-2xl animate-in slide-in-from-top duration-200">
          <form onSubmit={handleSearchSubmit} class="flex items-center gap-2">
            <div class="relative flex-1">
              <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-primary text-base">
                search
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search any river globally..."
                autoFocus
                class="w-full bg-surface-container-highest border border-primary/30 rounded-full pl-9 pr-8 py-2 text-xs text-white placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline-variant"
                >
                  <span class="material-symbols-outlined text-sm">cancel</span>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsMobileSearchOpen(false)}
              class="text-xs font-bold text-outline-variant hover:text-white px-2 py-1"
            >
              Cancel
            </button>
          </form>

          {/* Quick Suggestions on Mobile */}
          <div class="mt-3 flex flex-wrap gap-1.5">
            {QUICK_SUGGESTIONS.slice(0, 4).map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectSuggestion(suggestion)}
                class="text-[10px] font-medium bg-surface-container-high text-sage-muted px-2.5 py-1 rounded-full border border-primary/10"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};
