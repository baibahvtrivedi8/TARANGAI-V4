import React from 'react';
import { TarangLogo } from '../components/TarangLogo';

interface AboutProps {
  onNavigate: (route: string) => void;
}

export const About: React.FC<AboutProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-[calc(100vh-72px)] w-full bg-[#0B130E] p-6 md:p-12 overflow-y-auto flex flex-col items-center justify-center">
      <div className="max-w-4xl w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 my-auto">
        {/* Header Title Section with Logo */}
        <div className="text-center space-y-4">
          <TarangLogo size="lg" showTagline={true} showAiSubtitle={true} />
          <h1 className="font-yrguma text-3xl md:text-5xl font-bold text-white tracking-tight pt-1">
            Global Water Quality & Health Engine
          </h1>
          <p className="font-body-md text-sm md:text-base text-outline-variant max-w-2xl mx-auto leading-relaxed">
            A real-time global water quality intelligence platform providing AI-powered river health assessments, telemetry predictions, and environmental stressor analytics.
          </p>
        </div>

        {/* Developer Profile Card */}
        <div className="glass-panel organic-card rounded-[32px] p-6 md:p-8 border border-[#839958]/25 shadow-2xl relative overflow-hidden bg-[#111C16]">
          <div className="flex flex-col md:flex-row items-center md:items-center gap-6 relative z-10">
            {/* Developer Avatar / Icon Badge */}
            <div className="h-24 w-24 rounded-3xl bg-[#1A2D23] flex items-center justify-center text-[#839958] border border-[#839958]/40 shadow-xl flex-shrink-0">
              <span className="material-symbols-outlined text-4xl">badge</span>
            </div>

            {/* Info Body */}
            <div className="space-y-3 text-center md:text-left flex-grow">
              <div>
                <span className="font-parisienne text-base text-[#839958] block mb-0.5">
                  Creator & Lead Developer
                </span>
                <h2 className="font-yrguma text-3xl md:text-4xl font-bold text-white tracking-tight">
                  BAIBHAV TRIVEDI
                </h2>
                <p className="font-body-md text-xs md:text-sm text-[#C2D1B2] mt-0.5 font-medium">
                  Environmental AI Researcher & Hydrological Systems Developer
                </p>
              </div>

              {/* Email & Contact Pills */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
                <a
                  href="mailto:baibahvtrivedi8@gmail.com"
                  className="bg-[#F7F4D5] text-[#0A3323] px-5 py-2.5 rounded-full font-bold text-xs flex items-center gap-2 hover:bg-[#fffbe6] transition-all active:scale-95 shadow-lg cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">mail</span>
                  baibahvtrivedi8@gmail.com
                </a>

                <button
                  onClick={() => onNavigate('/assistant')}
                  className="bg-[#1B2C22] text-[#E5ECE7] hover:text-white border border-[#839958]/30 px-5 py-2.5 rounded-full font-bold text-xs flex items-center gap-2 hover:bg-[#839958]/20 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base text-[#839958]">psychology</span>
                  Launch AI Assistant
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Story & Philosophy Quote */}
        <div className="glass-panel rounded-[32px] p-6 md:p-8 border border-[#839958]/15 text-center space-y-3 bg-[#0D1711]">
          <p className="font-parisienne text-2xl md:text-3xl text-white font-normal max-w-2xl mx-auto leading-relaxed">
            "Every river has its own story — carrying ecological history, vital telemetry, and community health. TARANG AI was built to listen to that story through data."
          </p>
          <span className="font-yrguma text-sm text-[#F7F4D5] uppercase tracking-wider block font-bold pt-1">
            — BAIBHAV TRIVEDI
          </span>
        </div>

        {/* Typography & Design Archetype Palette Showcase */}
        <div className="glass-panel rounded-3xl p-6 border border-[#839958]/20 bg-[#111C16] space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <span className="font-parisienne text-sm text-[#839958] block">Typography System</span>
              <h3 className="font-yrguma text-lg font-bold text-white">Editorial Type Pairings</h3>
            </div>
            <span className="font-label-caps text-[10px] text-outline-variant uppercase">Design System</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-2xl bg-[#0D1711] border border-[#839958]/20 text-center">
              <span className="font-parisienne text-2xl text-[#F7F4D5] block mb-1">Parisianne</span>
              <span className="text-[10px] font-label-caps text-[#839958] uppercase">Heading Script</span>
            </div>
            <div className="p-3 rounded-2xl bg-[#0D1711] border border-[#839958]/20 text-center">
              <span className="font-yrguma text-xl text-white font-bold block mb-1">Yrguma</span>
              <span className="text-[10px] font-label-caps text-[#839958] uppercase">Middle Display</span>
            </div>
            <div className="p-3 rounded-2xl bg-[#0D1711] border border-[#839958]/20 text-center">
              <span className="font-yrguma text-lg text-[#F7F4D5] italic block mb-1">Victoria Queen</span>
              <span className="text-[10px] font-label-caps text-[#839958] uppercase">Swash Ligature</span>
            </div>
          </div>
        </div>

        {/* Platform Capabilities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-panel rounded-2xl p-5 border border-[#839958]/15 space-y-2 bg-[#111C16]">
            <div className="h-9 w-9 rounded-xl bg-[#1A2D23] border border-[#839958]/30 flex items-center justify-center text-[#839958]">
              <span className="material-symbols-outlined text-lg">public</span>
            </div>
            <h3 className="font-yrguma text-base font-bold text-white">Global Telemetry</h3>
            <p className="text-xs text-outline-variant leading-relaxed">
              Real-time monitoring across 2,400+ active global hydrological nodes backed by USGS, EPA WQX, EEA, and GEMStat networks.
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-[#839958]/15 space-y-2 bg-[#111C16]">
            <div className="h-9 w-9 rounded-xl bg-[#1A2D23] border border-[#839958]/30 flex items-center justify-center text-[#839958]">
              <span className="material-symbols-outlined text-lg">show_chart</span>
            </div>
            <h3 className="font-yrguma text-base font-bold text-white">Water Quality Index (WQI)</h3>
            <p className="text-xs text-outline-variant leading-relaxed">
              Automated multi-parameter evaluation indexing Dissolved Oxygen, Turbidity, pH, Nitrate, BOD, and Temperature.
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-[#839958]/15 space-y-2 bg-[#111C16]">
            <div className="h-9 w-9 rounded-xl bg-[#1A2D23] border border-[#839958]/30 flex items-center justify-center text-[#D3968C]">
              <span className="material-symbols-outlined text-lg">travel_explore</span>
            </div>
            <h3 className="font-yrguma text-base font-bold text-white">Coordinate Geocoding</h3>
            <p className="text-xs text-outline-variant leading-relaxed">
              Instant coordinate resolution mapping custom latitude & longitude points to local river basin telemetry.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

