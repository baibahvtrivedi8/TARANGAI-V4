import React, { useEffect, useState } from 'react';
import { TarangLogo } from './TarangLogo';

interface IntroSplashProps {
  onComplete: () => void;
}

export const IntroSplash: React.FC<IntroSplashProps> = ({ onComplete }) => {
  const [fadingOut, setFadingOut] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // 4.0 seconds display time with smooth progress tracking
    const startTime = Date.now();
    const duration = 3800;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const currentProg = Math.min(100, (elapsed / duration) * 100);
      setProgress(currentProg);

      if (elapsed >= duration) {
        clearInterval(interval);
        setFadingOut(true);
        setTimeout(onComplete, 600);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [onComplete]);

  const handleSkip = () => {
    setFadingOut(true);
    setTimeout(onComplete, 400);
  };

  return (
    <div
      className={`fixed inset-0 z-[100] bg-[#070E0A] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-700 select-none ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background Texture & Subtle Radial Gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(131,153,88,0.12)_0%,transparent_70%)] pointer-events-none" />

      {/* Floating Wave Animation Background SVG Layers */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <svg
          className="absolute bottom-0 left-0 w-[200%] h-64 text-[#839958] fill-current animate-wave-slow"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <path d="M0,0 C150,90 350,-40 500,40 C650,120 900,10 1200,60 L1200,120 L0,120 Z" />
        </svg>
        <svg
          className="absolute bottom-0 left-0 w-[200%] h-72 text-[#556937] fill-current opacity-30 animate-wave-fast"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <path d="M0,30 C200,-20 400,80 600,20 C800,-40 1000,60 1200,10 L1200,120 L0,120 Z" />
        </svg>
      </div>

      {/* Center Content: Exact Logo + Hydrological Intelligence Quote */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-xl space-y-6 animate-in fade-in zoom-in-95 duration-1000">
        {/* The Updated TARANG AI Embossed Logo */}
        <TarangLogo size="hero" showTagline={true} showAiSubtitle={true} />

        {/* Minimalistic Divider Line */}
        <div className="h-[1px] w-28 bg-gradient-to-r from-transparent via-[#839958] to-transparent my-2" />

        {/* Inspiring Thought Quote (No font labels) */}
        <blockquote className="font-parisienne text-2xl md:text-3xl text-[#F7F4D5] font-normal tracking-wide leading-relaxed">
          "Every river has its own story"
        </blockquote>

        {/* Timed Progress Bar & Skip Button */}
        <div className="flex flex-col items-center gap-3 pt-2 w-full max-w-xs">
          <div className="w-full h-1 bg-[#1A2D23] rounded-full overflow-hidden border border-[#839958]/20">
            <div
              className="h-full bg-gradient-to-r from-[#839958] to-[#D2E3A8] transition-all duration-75 ease-out rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          <button
            onClick={handleSkip}
            className="px-6 py-2 rounded-full border border-[#839958]/40 bg-[#121E17] text-[11px] font-bold text-[#F7F4D5] hover:bg-[#839958] hover:text-[#0A3323] transition-all cursor-pointer uppercase font-label-caps tracking-widest shadow-lg"
          >
            Enter Platform →
          </button>
        </div>
      </div>
    </div>
  );
};
