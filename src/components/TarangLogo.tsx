import React from 'react';

interface TarangLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  showTagline?: boolean;
  showAiSubtitle?: boolean;
  className?: string;
  onClick?: () => void;
}

export const TarangLogo: React.FC<TarangLogoProps> = ({
  size = 'md',
  showTagline = true,
  showAiSubtitle = true,
  className = '',
  onClick,
}) => {
  // Dimension definitions
  const dimensions = {
    sm: { emblemSize: 32, totalWidth: 'w-auto', titleSize: 'text-sm', aiSize: 'text-[9px]', tagSize: 'text-[7px]' },
    md: { emblemSize: 44, totalWidth: 'w-auto', titleSize: 'text-lg', aiSize: 'text-xs', tagSize: 'text-[8px]' },
    lg: { emblemSize: 64, totalWidth: 'w-auto', titleSize: 'text-2xl', aiSize: 'text-sm', tagSize: 'text-[10px]' },
    xl: { emblemSize: 88, totalWidth: 'w-auto', titleSize: 'text-3xl', aiSize: 'text-base', tagSize: 'text-xs' },
    hero: { emblemSize: 130, totalWidth: 'w-auto', titleSize: 'text-4xl md:text-5xl', aiSize: 'text-xl', tagSize: 'text-xs tracking-[0.35em]' },
  }[size];

  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Metallic 3D Embossed Emblem SVG */}
      <div className="relative flex items-center justify-center">
        <svg
          width={dimensions.emblemSize}
          height={dimensions.emblemSize}
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)] transition-transform duration-300 hover:scale-105"
        >
          <defs>
            {/* Metallic Sage Gradient for Main Stem */}
            <linearGradient id="tarangSageGrad" x1="20" y1="20" x2="180" y2="180" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#A8BF7E" />
              <stop offset="45%" stopColor="#839958" />
              <stop offset="85%" stopColor="#556937" />
              <stop offset="100%" stopColor="#3C4B25" />
            </linearGradient>

            {/* Highlight Gradient for Upper Surfaces */}
            <linearGradient id="tarangHighlight" x1="0%" y1="0%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#D2E3A8" />
              <stop offset="50%" stopColor="#8DA35E" />
              <stop offset="100%" stopColor="#4E6032" />
            </linearGradient>

            {/* Deep Shadow Gradient for Underside Waves */}
            <linearGradient id="tarangWaveGrad" x1="0%" y1="30%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#9AB26F" />
              <stop offset="60%" stopColor="#708547" />
              <stop offset="100%" stopColor="#374421" />
            </linearGradient>

            {/* Inner Shadow Filter */}
            <filter id="emboss3D" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="1" dy="2" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* BACKGROUND SUBTLE RADIAL GLOW */}
          <circle cx="100" cy="100" r="85" fill="#839958" fillOpacity="0.04" />

          {/* MAIN LETTER 'T' (Serif Top Bar & Stem) */}
          <g filter="url(#emboss3D)">
            {/* Top Serif Bar */}
            <path
              d="M 46 36 C 46 33, 49 31, 53 31 L 147 31 C 151 31, 154 33, 154 36 L 154 39 C 154 41, 152 42, 149 42 L 112 42 L 112 110 C 112 113, 109 115, 106 115 L 94 115 C 91 115, 88 113, 88 110 L 88 42 L 51 42 C 48 42, 46 41, 46 39 Z"
              fill="url(#tarangSageGrad)"
            />
            {/* Top Bar Highlight Edge */}
            <path
              d="M 53 32 L 147 32 C 150 32, 153 33.5, 153 35.5 L 53 35.5 Z"
              fill="url(#tarangHighlight)"
              fillOpacity="0.6"
            />
          </g>

          {/* BOTANICAL LEAF (Sprouting to the right) */}
          <g filter="url(#emboss3D)">
            {/* Leaf Body */}
            <path
              d="M 120 120 C 120 75, 145 48, 172 46 C 174 46, 175 47, 174 49 C 168 85, 152 115, 120 120 Z"
              fill="url(#tarangSageGrad)"
            />
            {/* Leaf Inner Center Vein */}
            <path
              d="M 124 115 C 138 92, 153 70, 170 50"
              stroke="#D2E3A8"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeOpacity="0.7"
            />
            {/* Leaf Left Shading */}
            <path
              d="M 120 120 C 120 75, 138 58, 150 51 C 135 78, 130 98, 120 120 Z"
              fill="url(#tarangHighlight)"
              fillOpacity="0.35"
            />
          </g>

          {/* FLUID WAVE RIBBONS (Sweeping under 'T') */}
          <g filter="url(#emboss3D)">
            {/* Primary Upper Wave Ribbon */}
            <path
              d="M 28 85 C 48 72, 70 85, 88 108 C 105 130, 130 148, 162 132 C 165 131, 166 134, 163 136 C 128 156, 95 142, 74 118 C 55 96, 38 88, 28 89 C 26 89, 26 86, 28 85 Z"
              fill="url(#tarangHighlight)"
            />

            {/* Secondary Lower Wave Ribbon (Deep Swoop) */}
            <path
              d="M 36 102 C 55 92, 72 104, 90 126 C 110 152, 136 166, 172 142 C 175 140, 176 143, 173 145 C 132 173, 102 160, 78 134 C 60 114, 46 106, 36 106 C 34 106, 34 103, 36 102 Z"
              fill="url(#tarangWaveGrad)"
            />
          </g>
        </svg>
      </div>

      {/* TYPOGRAPHIC BRAND TEXT: T A R A N G */}
      <div className="flex flex-col items-center mt-2">
        <div className="flex items-center tracking-[0.28em] font-black text-white font-yrguma leading-none">
          <span className={`${dimensions.titleSize} text-[#F7F4D5]`}>T</span>
          {/* Custom Chevron-shaped 'A' matching the logo branding */}
          <span className={`${dimensions.titleSize} text-[#F7F4D5] px-[0.08em] inline-flex items-center justify-center font-serif`}>
            Λ
          </span>
          <span className={`${dimensions.titleSize} text-[#F7F4D5]`}>R</span>
          <span className={`${dimensions.titleSize} text-[#F7F4D5] px-[0.08em] inline-flex items-center justify-center font-serif`}>
            Λ
          </span>
          <span className={`${dimensions.titleSize} text-[#F7F4D5]`}>N</span>
          <span className={`${dimensions.titleSize} text-[#F7F4D5]`}>G</span>
        </div>

        {/* AI SUBTITLE WITH FLANKING BARS */}
        {showAiSubtitle && (
          <div className="flex items-center justify-center gap-3 w-full my-1">
            <div className="h-[1px] w-8 sm:w-12 bg-gradient-to-r from-transparent via-[#839958]/80 to-[#839958]" />
            <span className={`font-mono font-bold tracking-[0.25em] text-[#839958] ${dimensions.aiSize}`}>
              AI
            </span>
            <div className="h-[1px] w-8 sm:w-12 bg-gradient-to-l from-transparent via-[#839958]/80 to-[#839958]" />
          </div>
        )}

        {/* TAGLINE: RIDE THE WAVE OF INTELLIGENCE */}
        {showTagline && (
          <p className={`font-label-caps text-[#A3BA73] uppercase font-bold tracking-[0.22em] text-center opacity-90 mt-0.5 ${dimensions.tagSize}`}>
            Ride The Wave Of Intelligence
          </p>
        )}
      </div>
    </div>
  );
};
