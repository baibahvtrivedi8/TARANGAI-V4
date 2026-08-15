import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { IntroSplash } from './components/IntroSplash';
import { GlobalView } from './pages/GlobalView';
import { StationDetail } from './pages/StationDetail';
import { AiAssistant } from './pages/AiAssistant';
import { About } from './pages/About';
import { LoginPage } from './pages/LoginPage';

export default function App() {
  // Let the login page be at the first
  const [currentPath, setCurrentPath] = useState<string>(() => {
    const p = window.location.pathname;
    if (p && p !== '/' && p !== '') {
      return p;
    }
    // Default initial route is /login
    return '/login';
  });
  const [initialSearchQuery, setInitialSearchQuery] = useState<string>('');

  // Show intro splash screen on initial session load
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    return !sessionStorage.getItem('tarang_splash_seen');
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleFinishSplash = () => {
    sessionStorage.setItem('tarang_splash_seen', 'true');
    setShowSplash(false);
  };

  const navigate = (route: string) => {
    let cleanRoute = route;
    let query = '';

    if (route.includes('?q=')) {
      const parts = route.split('?q=');
      cleanRoute = parts[0];
      query = decodeURIComponent(parts[1] || '');
      setInitialSearchQuery(query);
    } else {
      setInitialSearchQuery('');
    }

    window.history.pushState({}, '', route);
    setCurrentPath(cleanRoute);
  };

  // Route matching
  const renderScreen = () => {
    if (currentPath.startsWith('/station/')) {
      const stationId = currentPath.replace('/station/', '');
      return <StationDetail stationId={stationId} onNavigate={navigate} />;
    }

    if (currentPath === '/assistant') {
      return <AiAssistant initialQuery={initialSearchQuery} onNavigate={navigate} />;
    }

    if (currentPath === '/about') {
      return <About onNavigate={navigate} />;
    }

    if (currentPath === '/login') {
      return <LoginPage onNavigate={navigate} />;
    }

    // Default to Global View
    return <GlobalView onNavigate={navigate} />;
  };

  return (
    <div className="min-h-screen w-full bg-background text-on-surface font-body-md flex flex-col selection:bg-primary selection:text-on-primary overflow-hidden relative">
      {/* Intro Splash Animation Overlay */}
      {showSplash && <IntroSplash onComplete={handleFinishSplash} />}

      <Header currentRoute={currentPath} onNavigate={navigate} />
      <main className="flex-grow w-full relative min-h-0">{renderScreen()}</main>
    </div>
  );
}
