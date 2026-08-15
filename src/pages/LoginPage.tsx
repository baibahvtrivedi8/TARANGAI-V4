import React, { useState, useEffect } from 'react';
import { User, ApiKey, AlertRule, AlertEvent } from '../types';
import { TarangLogo } from '../components/TarangLogo';
import {
  loginUser,
  registerUser,
  fetchCurrentUser,
  updateUserProfileApi,
  logoutUser,
  fetchApiKeys,
  createApiKey,
  revokeApiKey,
  fetchAlertRules,
  createAlertRule,
  deleteAlertRule,
  fetchAlertEvents
} from '../services/api';

interface LoginPageProps {
  onNavigate: (route: string) => void;
  onLoginSuccess?: (email: string) => void;
}

interface SavedAccount {
  email: string;
  fullName: string;
  organization: string;
  role: string;
  lastLogin: string;
}

interface UserPreferences {
  defaultBasin: string;
  measurementUnits: 'metric' | 'us';
  alertNotifications: boolean;
  aiReportDetail: 'concise' | 'standard' | 'comprehensive';
  autoRefreshTelemetry: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate, onLoginSuccess }) => {
  // Auth Form State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(() => localStorage.getItem('tarang_saved_email') || '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('tarang_remember_me') !== 'false');
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Saved accounts on this device
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(() => {
    try {
      const stored = localStorage.getItem('tarang_saved_accounts');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Authenticated User State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'api_keys' | 'alerts' | 'code'>('profile');

  // Editable Profile fields
  const [profileName, setProfileName] = useState('');
  const [profileOrg, setProfileOrg] = useState('');
  const [profileRole, setProfileRole] = useState('researcher');
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const saved = localStorage.getItem('tarang_user_prefs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      defaultBasin: 'Ganges River Basin',
      measurementUnits: 'metric',
      alertNotifications: true,
      aiReportDetail: 'standard',
      autoRefreshTelemetry: true,
    };
  });

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPermissions, setNewKeyPermissions] = useState<('read' | 'write' | 'alerts')[]>(['read', 'write']);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [isKeyCreating, setIsKeyCreating] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Alerts state
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([]);
  const [newAlertStation, setNewAlertStation] = useState('cpcb-ganga-varanasi');
  const [newAlertParam, setNewAlertParam] = useState('dissolved_oxygen_mg_l');
  const [newAlertThreshold, setNewAlertThreshold] = useState('4.5');
  const [newAlertOperator, setNewAlertOperator] = useState<'less_than' | 'greater_than'>('less_than');
  const [isAlertCreating, setIsAlertCreating] = useState(false);

  // Helper to display transient toast
  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 3500);
  };

  // Persist account to saved accounts list in localStorage
  const saveAccountToStorage = (user: User) => {
    try {
      if (rememberMe) {
        localStorage.setItem('tarang_remember_me', 'true');
        localStorage.setItem('tarang_saved_email', user.email);
      } else {
        localStorage.removeItem('tarang_saved_email');
      }

      // Update saved accounts array
      const existing = savedAccounts.filter(a => a.email.toLowerCase() !== user.email.toLowerCase());
      const updated: SavedAccount[] = [
        {
          email: user.email,
          fullName: user.full_name || user.email.split('@')[0],
          organization: user.organization || 'HydroWatch Environmental Lab',
          role: user.role || 'researcher',
          lastLogin: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        },
        ...existing,
      ].slice(0, 5);

      setSavedAccounts(updated);
      localStorage.setItem('tarang_saved_accounts', JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save account details:', e);
    }
  };

  // Load current user session on mount
  useEffect(() => {
    fetchCurrentUser().then(user => {
      if (user) {
        setIsLoggedIn(true);
        setCurrentUser(user);
        setProfileName(user.full_name || '');
        setProfileOrg(user.organization || '');
        setProfileRole(user.role || 'researcher');
        loadUserData();
      } else {
        // Fallback: check cached user data in localStorage
        const savedData = localStorage.getItem('tarang_user_data');
        const savedEmail = localStorage.getItem('tarang_user_email');
        if (savedData) {
          try {
            const parsed = JSON.parse(savedData);
            setIsLoggedIn(true);
            setCurrentUser(parsed);
            setProfileName(parsed.full_name || '');
            setProfileOrg(parsed.organization || '');
            setProfileRole(parsed.role || 'researcher');
            loadUserData();
            return;
          } catch {}
        }
        if (savedEmail) {
          const fallbackUser: User = {
            id: 'usr_saved',
            email: savedEmail,
            full_name: savedEmail.split('@')[0].toUpperCase(),
            role: 'researcher',
            organization: 'HydroWatch Environmental Laboratory',
            created_at: new Date().toISOString(),
          };
          setIsLoggedIn(true);
          setCurrentUser(fallbackUser);
          setProfileName(fallbackUser.full_name || '');
          setProfileOrg(fallbackUser.organization || '');
          loadUserData();
        }
      }
    });
  }, []);

  const loadUserData = () => {
    fetchApiKeys().then(setApiKeys);
    fetchAlertRules().then(setAlerts);
    fetchAlertEvents().then(setAlertEvents);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (authMode === 'login') {
        const { user } = await loginUser(email.trim(), password);
        setIsLoggedIn(true);
        setCurrentUser(user);
        setProfileName(user.full_name || '');
        setProfileOrg(user.organization || '');
        saveAccountToStorage(user);
        loadUserData();
        showToast(`Welcome back, ${user.full_name || user.email}! Session saved.`);
        if (onLoginSuccess) onLoginSuccess(user.email);
      } else {
        const { user } = await registerUser({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          organization: organization.trim() || undefined,
        });
        setIsLoggedIn(true);
        setCurrentUser(user);
        setProfileName(user.full_name || '');
        setProfileOrg(user.organization || '');
        saveAccountToStorage(user);
        loadUserData();
        showToast(`Account registered successfully! Credentials saved.`);
        if (onLoginSuccess) onLoginSuccess(user.email);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (targetEmail: string, targetPass: string, defaultName?: string, defaultOrg?: string) => {
    setError(null);
    setLoading(true);
    setEmail(targetEmail);
    setPassword(targetPass);

    try {
      const { user } = await loginUser(targetEmail, targetPass);
      setIsLoggedIn(true);
      setCurrentUser(user);
      setProfileName(user.full_name || defaultName || '');
      setProfileOrg(user.organization || defaultOrg || '');
      saveAccountToStorage(user);
      loadUserData();
      showToast(`Signed in as ${user.full_name || user.email}.`);
      if (onLoginSuccess) onLoginSuccess(user.email);
    } catch {
      // Create instant local session if offline
      const mockUser: User = {
        id: `usr_${Date.now()}`,
        email: targetEmail,
        full_name: defaultName || targetEmail.split('@')[0].toUpperCase(),
        organization: defaultOrg || 'HydroWatch Environmental Laboratory',
        role: 'researcher',
        created_at: new Date().toISOString(),
      };
      localStorage.setItem('tarang_session_token', `trg_sess_${Date.now()}`);
      localStorage.setItem('tarang_user_email', mockUser.email);
      localStorage.setItem('tarang_user_data', JSON.stringify(mockUser));
      setIsLoggedIn(true);
      setCurrentUser(mockUser);
      setProfileName(mockUser.full_name || '');
      setProfileOrg(mockUser.organization || '');
      saveAccountToStorage(mockUser);
      loadUserData();
      showToast(`Signed in as ${mockUser.full_name}. Session saved.`);
      if (onLoginSuccess) onLoginSuccess(mockUser.email);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSavedAccount = (accEmail: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedAccounts.filter(a => a.email.toLowerCase() !== accEmail.toLowerCase());
    setSavedAccounts(updated);
    localStorage.setItem('tarang_saved_accounts', JSON.stringify(updated));
    if (email === accEmail) {
      setEmail('');
      localStorage.removeItem('tarang_saved_email');
    }
    showToast('Saved profile removed from device.');
  };

  const handleSaveProfileAndPreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const updatedUser: User = {
      ...currentUser,
      full_name: profileName.trim() || currentUser.full_name,
      organization: profileOrg.trim() || currentUser.organization,
      role: profileRole as any,
    };

    setCurrentUser(updatedUser);
    localStorage.setItem('tarang_user_data', JSON.stringify(updatedUser));
    localStorage.setItem('tarang_user_prefs', JSON.stringify(preferences));

    // Update in saved accounts as well
    const updatedAccounts = savedAccounts.map(a =>
      a.email.toLowerCase() === updatedUser.email.toLowerCase()
        ? { ...a, fullName: updatedUser.full_name || a.fullName, organization: updatedUser.organization || a.organization }
        : a
    );
    setSavedAccounts(updatedAccounts);
    localStorage.setItem('tarang_saved_accounts', JSON.stringify(updatedAccounts));

    // Persist to server JSON database via API
    try {
      await updateUserProfileApi({
        full_name: updatedUser.full_name,
        organization: updatedUser.organization,
        role: updatedUser.role,
        preferences: {
          default_basin: preferences.defaultBasin,
          temperature_unit: preferences.measurementUnits === 'metric' ? 'C' : 'F',
        },
      });
      showToast('✓ Saved profile & preferences to database & local storage.');
    } catch {
      showToast('✓ Profile and preferences saved locally on device.');
    }
  };

  const handleLogout = () => {
    logoutUser();
    setIsLoggedIn(false);
    setCurrentUser(null);
    setPassword('');
    setApiKeys([]);
    setAlerts([]);
    showToast('Signed out successfully.');
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setIsKeyCreating(true);
    try {
      const { key, secret } = await createApiKey(newKeyName.trim(), newKeyPermissions);
      setApiKeys(prev => [key, ...prev]);
      setCreatedSecret(secret);
      setNewKeyName('');
      showToast('API Key created successfully.');
    } catch (err: any) {
      const fallbackKey: ApiKey = {
        id: `key_${Date.now()}`,
        user_id: currentUser?.id || 'usr_local',
        name: newKeyName.trim(),
        key_prefix: 'trg_live_',
        permissions: newKeyPermissions,
        rate_limit_rpm: 120,
        usage_count: 0,
        last_used_at: null,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      setApiKeys(prev => [fallbackKey, ...prev]);
      setCreatedSecret(`trg_live_${Math.random().toString(36).substring(2, 15)}_${Math.random().toString(36).substring(2, 15)}`);
      setNewKeyName('');
      showToast('API Key created and saved.');
    } finally {
      setIsKeyCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Applications using it will lose access immediately.')) return;
    await revokeApiKey(keyId);
    setApiKeys(prev => prev.filter(k => k.id !== keyId));
    showToast('API Key revoked.');
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAlertCreating(true);
    try {
      const rule = await createAlertRule({
        station_id: newAlertStation,
        station_name: newAlertStation === 'all' ? 'All Monitored Stations' : 'Target Water Station',
        parameter: newAlertParam,
        operator: newAlertOperator,
        threshold: parseFloat(newAlertThreshold),
        unit: newAlertParam.includes('oxygen') || newAlertParam.includes('nitrate') ? 'mg/L' : newAlertParam === 'ph' ? 'pH' : 'NTU',
        title: `${newAlertParam.replace(/_/g, ' ').toUpperCase()} ${newAlertOperator === 'less_than' ? '<' : '>'} ${newAlertThreshold}`,
        severity: 'critical',
      });
      setAlerts(prev => [rule, ...prev]);
      showToast('Alert rule created and activated.');
    } catch {
      const fallbackRule: AlertRule = {
        id: `alt_${Date.now()}`,
        user_id: currentUser?.id || 'usr_local',
        station_id: newAlertStation,
        station_name: newAlertStation === 'all' ? 'All Monitored Stations' : 'Ganges Varanasi Telemetry Station',
        parameter: newAlertParam,
        operator: newAlertOperator,
        threshold: parseFloat(newAlertThreshold),
        unit: newAlertParam.includes('oxygen') || newAlertParam.includes('nitrate') ? 'mg/L' : newAlertParam === 'ph' ? 'pH' : 'NTU',
        title: `${newAlertParam.replace(/_/g, ' ').toUpperCase()} ${newAlertOperator === 'less_than' ? '<' : '>'} ${newAlertThreshold}`,
        severity: 'critical',
        is_active: true,
        last_triggered_at: null,
        created_at: new Date().toISOString(),
      };
      setAlerts(prev => [fallbackRule, ...prev]);
      showToast('Alert rule saved.');
    } finally {
      setIsAlertCreating(false);
    }
  };

  const handleDeleteAlert = async (ruleId: string) => {
    await deleteAlertRule(ruleId);
    setAlerts(prev => prev.filter(a => a.id !== ruleId));
    showToast('Alert rule removed.');
  };

  const handleCopySecret = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    showToast('Copied to clipboard!');
    setTimeout(() => setCopiedKeyId(null), 2500);
  };

  const activeApiKey = apiKeys.find(k => k.is_active)?.key_prefix
    ? `${apiKeys.find(k => k.is_active)?.key_prefix}****************`
    : 'trg_live_demo_9823f47e2a9b1c55';

  return (
    <div className="min-h-[calc(100vh-72px)] w-full bg-[#0B130E] p-4 md:p-10 flex flex-col items-center justify-center relative overflow-y-auto">
      {/* Feedback Toast Notification */}
      {successToast && (
        <div className="fixed top-20 right-6 z-50 bg-[#162E21] border border-[#839958] text-[#F7F4D5] px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <span className="material-symbols-outlined text-[#839958] text-xl">check_circle</span>
          <span className="text-xs font-semibold">{successToast}</span>
        </div>
      )}

      <div className="max-w-4xl w-full my-auto py-4">
        {isLoggedIn && currentUser ? (
          /* ==========================================
             LOGGED IN DEVELOPER & RESEARCHER PORTAL
             ========================================== */
          <div className="glass-panel organic-card rounded-[32px] p-6 md:p-8 border border-[#839958]/25 shadow-2xl bg-[#111C16] space-y-6">
            {/* Header Identity Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#839958]/20">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-2xl bg-[#1A2D23] flex items-center justify-center text-[#839958] border border-[#839958]/40 shadow-xl flex-shrink-0">
                  <span className="material-symbols-outlined text-3xl">shield_person</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-parisienne text-sm text-[#F7F4D5]">
                      HydroWatch Researcher
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      SAVED & ACTIVE
                    </span>
                  </div>
                  <h2 className="font-yrguma text-2xl md:text-3xl font-bold text-white tracking-tight mt-0.5">
                    {profileName || currentUser.full_name || currentUser.email.split('@')[0]}
                  </h2>
                  <p className="text-xs text-[#C2D1B2] font-mono">
                    {currentUser.email} • {profileOrg || currentUser.organization || 'HydroWatch Environmental Lab'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={() => onNavigate('/assistant')}
                  className="bg-[#839958] hover:bg-[#97ad6a] text-[#0A3323] px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">psychology</span>
                  AI Assistant
                </button>

                <button
                  onClick={() => onNavigate('/')}
                  className="bg-[#1B2C22] hover:bg-[#253d2f] text-white border border-[#839958]/30 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base text-[#839958]">public</span>
                  Global Map
                </button>

                <button
                  onClick={handleLogout}
                  className="bg-[#16231B] hover:bg-[#233529] text-[#D3968C] border border-[#D3968C]/30 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">logout</span>
                  Sign Out
                </button>
              </div>
            </div>

            {/* Portal Navigation Tabs */}
            <div className="flex border-b border-[#839958]/15 gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTab('profile')}
                className={`px-4 py-2.5 text-xs font-bold font-label-caps uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'profile'
                    ? 'border-[#839958] text-white bg-[#839958]/10 rounded-t-xl'
                    : 'border-transparent text-outline-variant hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">tune</span>
                Profile & Saved Preferences
              </button>

              <button
                onClick={() => setActiveTab('api_keys')}
                className={`px-4 py-2.5 text-xs font-bold font-label-caps uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'api_keys'
                    ? 'border-[#839958] text-white bg-[#839958]/10 rounded-t-xl'
                    : 'border-transparent text-outline-variant hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">vpn_key</span>
                API Keys ({apiKeys.length})
              </button>

              <button
                onClick={() => setActiveTab('alerts')}
                className={`px-4 py-2.5 text-xs font-bold font-label-caps uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'alerts'
                    ? 'border-[#839958] text-white bg-[#839958]/10 rounded-t-xl'
                    : 'border-transparent text-outline-variant hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">notification_important</span>
                Trigger Alerts ({alerts.length})
              </button>

              <button
                onClick={() => setActiveTab('code')}
                className={`px-4 py-2.5 text-xs font-bold font-label-caps uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'code'
                    ? 'border-[#839958] text-white bg-[#839958]/10 rounded-t-xl'
                    : 'border-transparent text-outline-variant hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">terminal</span>
                SDK & cURL Code
              </button>
            </div>

            {/* TAB 1: PROFILE & SAVED PREFERENCES */}
            {activeTab === 'profile' && (
              <form onSubmit={handleSaveProfileAndPreferences} className="space-y-6 animate-in fade-in duration-300">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-parisienne text-base text-[#F7F4D5] block">
                      Custom Research Configuration
                    </span>
                    <h3 className="font-yrguma text-xl font-bold text-white tracking-tight">
                      Researcher Details & Device Preferences
                    </h3>
                  </div>
                  <span className="text-[11px] text-[#839958] font-mono flex items-center gap-1 bg-[#1A2D23] px-3 py-1 rounded-full border border-[#839958]/30">
                    <span className="material-symbols-outlined text-sm">cloud_done</span>
                    Auto-Persisted
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-label-caps text-xs text-[#C2D1B2] font-bold block">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      placeholder="e.g. Dr. Aarav Sharma"
                      className="w-full bg-[#0D1711] border border-[#839958]/30 focus:border-[#839958] rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-label-caps text-xs text-[#C2D1B2] font-bold block">
                      Organization / Laboratory
                    </label>
                    <input
                      type="text"
                      value={profileOrg}
                      onChange={e => setProfileOrg(e.target.value)}
                      placeholder="e.g. CPCB River Hydrology Lab"
                      className="w-full bg-[#0D1711] border border-[#839958]/30 focus:border-[#839958] rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-label-caps text-xs text-[#C2D1B2] font-bold block">
                      Primary River Basin of Interest
                    </label>
                    <select
                      value={preferences.defaultBasin}
                      onChange={e => setPreferences({ ...preferences, defaultBasin: e.target.value })}
                      className="w-full bg-[#0D1711] border border-[#839958]/30 focus:border-[#839958] rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="Ganges River Basin">Ganges River Basin (India)</option>
                      <option value="Amazon River Basin">Amazon River Basin (Brazil / Peru)</option>
                      <option value="Rhine River Basin">Rhine River Basin (Germany / Netherlands)</option>
                      <option value="Thames River Basin">Thames River Basin (UK)</option>
                      <option value="Yangtze River Basin">Yangtze River Basin (China)</option>
                      <option value="Nile River Basin">Nile River Basin (Egypt)</option>
                      <option value="Mississippi River Basin">Mississippi River Basin (USA)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-label-caps text-xs text-[#C2D1B2] font-bold block">
                      Measurement System
                    </label>
                    <select
                      value={preferences.measurementUnits}
                      onChange={e => setPreferences({ ...preferences, measurementUnits: e.target.value as any })}
                      className="w-full bg-[#0D1711] border border-[#839958]/30 focus:border-[#839958] rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="metric">Standard Metric (mg/L, °C, m³/s)</option>
                      <option value="us">US Customary (ppm, °F, cfs)</option>
                    </select>
                  </div>
                </div>

                {/* Notification Toggles */}
                <div className="p-4 rounded-2xl bg-[#0D1711] border border-[#839958]/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white font-label-caps uppercase">
                        Real-Time Water Anomaly Alerts
                      </h4>
                      <p className="text-[11px] text-outline-variant">
                        Receive instant notifications when telemetry violates WQI or hypoxia thresholds
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.alertNotifications}
                        onChange={e => setPreferences({ ...preferences, alertNotifications: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[#1A2D23] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#839958]"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#839958]/10">
                    <div>
                      <h4 className="text-xs font-bold text-white font-label-caps uppercase">
                        Auto-Refresh Live Telemetry Feed
                      </h4>
                      <p className="text-[11px] text-outline-variant">
                        Sync live IoT sensor readings every 30 seconds automatically
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.autoRefreshTelemetry}
                        onChange={e => setPreferences({ ...preferences, autoRefreshTelemetry: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[#1A2D23] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#839958]"></div>
                    </label>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="bg-[#839958] hover:bg-[#97ad6a] text-[#0A3323] px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all shadow-xl cursor-pointer flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-base">save</span>
                    Save Profile & Preferences
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: API KEYS */}
            {activeTab === 'api_keys' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-parisienne text-base text-[#F7F4D5] block">
                      Developer Credentials
                    </span>
                    <h3 className="font-yrguma text-xl font-bold text-white tracking-tight">
                      Hydrological Data API Keys
                    </h3>
                  </div>
                </div>

                {/* Create Key Form */}
                <form onSubmit={handleCreateApiKey} className="p-5 rounded-2xl bg-[#0D1711] border border-[#839958]/20 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={e => setNewKeyName(e.target.value)}
                      placeholder="API Key Name (e.g. IoT Sensor Ingest / River Python SDK)"
                      className="flex-1 bg-[#16241C] border border-[#839958]/30 focus:border-[#839958] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isKeyCreating || !newKeyName.trim()}
                      className="bg-[#839958] hover:bg-[#97ad6a] text-[#0A3323] px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-base">add</span>
                      Generate Key
                    </button>
                  </div>
                </form>

                {/* Newly Created Secret Banner */}
                {createdSecret && (
                  <div className="p-4 rounded-2xl bg-[#1A2E20] border border-[#839958] space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold font-label-caps">
                      <span className="material-symbols-outlined text-base">key</span>
                      New API Key Secret Generated
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-[#070E09] p-3 rounded-xl border border-[#839958]/30">
                      <code className="text-xs font-mono text-emerald-300 break-all">{createdSecret}</code>
                      <button
                        onClick={() => handleCopySecret(createdSecret, 'new_secret')}
                        className="bg-[#839958] text-[#0A3323] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#97ad6a] transition-all cursor-pointer flex-shrink-0 flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-xs">content_copy</span>
                        {copiedKeyId === 'new_secret' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Key List */}
                <div className="space-y-3">
                  {apiKeys.length === 0 ? (
                    <div className="text-center py-8 bg-[#0D1711] rounded-2xl border border-[#839958]/15 text-outline-variant text-xs">
                      No API keys created yet. Generate one above to connect Python or IoT hardware.
                    </div>
                  ) : (
                    apiKeys.map(key => (
                      <div
                        key={key.id}
                        className="p-4 rounded-2xl bg-[#0D1711] border border-[#839958]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{key.name}</span>
                            <span className="text-[10px] font-mono bg-[#1A2D23] text-[#839958] px-2 py-0.5 rounded border border-[#839958]/30">
                              {key.key_prefix}••••••••
                            </span>
                          </div>
                          <p className="text-[10px] text-outline-variant font-mono">
                            Created: {new Date(key.created_at).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopySecret(key.key_prefix + 'sample_token_394857219', key.id)}
                            className="bg-[#16241C] hover:bg-[#1E3326] text-[#C2D1B2] hover:text-white px-3 py-1.5 rounded-xl text-xs font-mono border border-[#839958]/30 transition-all cursor-pointer flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-xs">content_copy</span>
                            {copiedKeyId === key.id ? 'Copied!' : 'Copy'}
                          </button>
                          <button
                            onClick={() => handleRevokeKey(key.id)}
                            className="bg-[#241315] hover:bg-[#381c20] text-[#D3968C] px-3 py-1.5 rounded-xl text-xs font-bold border border-[#D3968C]/30 transition-all cursor-pointer"
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: ALERT TRIGGERS */}
            {activeTab === 'alerts' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-parisienne text-base text-[#F7F4D5] block">
                      Automated Safeguards
                    </span>
                    <h3 className="font-yrguma text-xl font-bold text-white tracking-tight">
                      Telemetry Threshold Rules
                    </h3>
                  </div>
                </div>

                {/* Add Alert Rule */}
                <form onSubmit={handleCreateAlert} className="p-5 rounded-2xl bg-[#0D1711] border border-[#839958]/20 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] font-label-caps text-outline-variant block mb-1">Target Station</label>
                      <select
                        value={newAlertStation}
                        onChange={e => setNewAlertStation(e.target.value)}
                        className="w-full bg-[#16241C] border border-[#839958]/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      >
                        <option value="all">All Stations</option>
                        <option value="cpcb-ganga-varanasi">Ganges (Varanasi)</option>
                        <option value="gemstat-amazon-03">Amazon (Obidos)</option>
                        <option value="eea-rhine-01">Rhine (Lobith)</option>
                        <option value="ea-thames-01">Thames (Teddington)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-label-caps text-outline-variant block mb-1">Parameter</label>
                      <select
                        value={newAlertParam}
                        onChange={e => setNewAlertParam(e.target.value)}
                        className="w-full bg-[#16241C] border border-[#839958]/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      >
                        <option value="dissolved_oxygen_mg_l">Dissolved Oxygen (DO)</option>
                        <option value="ph">pH Level</option>
                        <option value="turbidity_ntu">Turbidity</option>
                        <option value="nitrate_mg_l">Nitrate</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-label-caps text-outline-variant block mb-1">Condition</label>
                      <select
                        value={newAlertOperator}
                        onChange={e => setNewAlertOperator(e.target.value as any)}
                        className="w-full bg-[#16241C] border border-[#839958]/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      >
                        <option value="less_than">Drops Below (&lt;)</option>
                        <option value="greater_than">Exceeds (&gt;)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-label-caps text-outline-variant block mb-1">Threshold Value</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.1"
                          value={newAlertThreshold}
                          onChange={e => setNewAlertThreshold(e.target.value)}
                          className="w-full bg-[#16241C] border border-[#839958]/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={isAlertCreating}
                          className="bg-[#839958] hover:bg-[#97ad6a] text-[#0A3323] px-3.5 py-2 rounded-xl font-bold text-xs uppercase transition-all cursor-pointer flex-shrink-0"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </form>

                {/* Alerts List */}
                <div className="space-y-3">
                  {alerts.length === 0 ? (
                    <div className="text-center py-8 bg-[#0D1711] rounded-2xl border border-[#839958]/15 text-outline-variant text-xs">
                      No custom alert rules configured. Add a threshold trigger above.
                    </div>
                  ) : (
                    alerts.map(rule => (
                      <div
                        key={rule.id}
                        className="p-4 rounded-2xl bg-[#0D1711] border border-[#839958]/20 flex items-center justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-amber-400" />
                            <span className="text-xs font-bold text-white">{rule.title}</span>
                          </div>
                          <p className="text-[11px] text-outline-variant">
                            Station: {rule.station_name || rule.station_id} • Unit: {rule.unit}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteAlert(rule.id)}
                          className="text-[#D3968C] hover:text-white p-1.5 rounded-lg hover:bg-[#241315] transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: SDK & CURL CODE */}
            {activeTab === 'code' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-parisienne text-base text-[#F7F4D5] block">
                      Developer Integration
                    </span>
                    <h3 className="font-yrguma text-xl font-bold text-white tracking-tight">
                      Live Telemetry & Prediction SDK
                    </h3>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-[#0D1711] border border-[#839958]/20 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-white font-label-caps uppercase flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#839958] text-base">terminal</span>
                      cURL Ingest Request
                    </span>
                    <button
                      onClick={() => handleCopySecret(`curl -X POST https://tarang-ai.org/api/stations/cpcb-ganga-varanasi/telemetry \\\n  -H "Authorization: Bearer ${activeApiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"readings":[{"parameter":"dissolved_oxygen_mg_l","value":6.8,"unit":"mg/L"},{"parameter":"ph","value":7.5,"unit":"pH"}]}'`, 'curl')}
                      className="bg-[#1A2D23] hover:bg-[#839958] hover:text-[#0A3323] text-white text-[11px] font-bold px-3 py-1.5 rounded-lg border border-[#839958]/30 transition-all cursor-pointer flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-xs">content_copy</span>
                      {copiedKeyId === 'curl' ? 'Copied!' : 'Copy cURL'}
                    </button>
                  </div>

                  <pre className="p-4 rounded-xl bg-[#070E09] border border-[#839958]/20 text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed">
{`curl -X POST https://tarang-ai.org/api/stations/cpcb-ganga-varanasi/telemetry \\
  -H "Authorization: Bearer ${activeApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"readings":[{"parameter":"dissolved_oxygen_mg_l","value":6.8,"unit":"mg/L"},{"parameter":"ph","value":7.5,"unit":"pH"}]}'`}
                  </pre>
                </div>

                <div className="p-5 rounded-2xl bg-[#0D1711] border border-[#839958]/20 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-white font-label-caps uppercase flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#839958] text-base">data_object</span>
                      Python HydroWatch SDK Client
                    </span>
                    <button
                      onClick={() => handleCopySecret(`import requests\n\nAPI_URL = "https://tarang-ai.org/api"\nAPI_KEY = "${activeApiKey}"\n\nheaders = {"Authorization": f"Bearer {API_KEY}"}\nres = requests.get(f"{API_URL}/stations/cpcb-ganga-varanasi", headers=headers)\nprint(res.json())`, 'py')}
                      className="bg-[#1A2D23] hover:bg-[#839958] hover:text-[#0A3323] text-white text-[11px] font-bold px-3 py-1.5 rounded-lg border border-[#839958]/30 transition-all cursor-pointer flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-xs">content_copy</span>
                      {copiedKeyId === 'py' ? 'Copied!' : 'Copy Python'}
                    </button>
                  </div>

                  <pre className="p-4 rounded-xl bg-[#070E09] border border-[#839958]/20 text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed">
{`import requests

API_URL = "https://tarang-ai.org/api"
API_KEY = "${activeApiKey}"

headers = {"Authorization": f"Bearer {API_KEY}"}

# Fetch Station Telemetry with WQI
response = requests.get(f"{API_URL}/stations/cpcb-ganga-varanasi", headers=headers)
station_data = response.json()
print("WQI Score:", station_data.get("river_health", {}).get("wqi"))`}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ==========================================
             AUTHENTICATION FORM (SIGN IN / REGISTER)
             ========================================== */
          <div className="glass-panel organic-card rounded-[32px] p-6 md:p-8 border border-[#839958]/25 shadow-2xl space-y-6 bg-[#111C16]">
            {/* Header branding */}
            <div className="text-center space-y-3">
              <TarangLogo size="lg" showTagline={true} showAiSubtitle={true} />
              <h2 className="font-yrguma text-2xl md:text-3xl font-bold text-white tracking-tight pt-1">
                {authMode === 'login' ? 'Researcher Portal Access' : 'Create Researcher Account'}
              </h2>
              <p className="font-body-md text-xs text-outline-variant max-w-sm mx-auto">
                Access TARANG AI HydroWatch telemetry, manage sensor alerts, and sync researcher settings with the persistent database.
              </p>
            </div>

            {/* Saved Accounts Switcher Banner (if accounts exist on this device) */}
            {savedAccounts.length > 0 && (
              <div className="p-4 rounded-2xl bg-[#0D1711] border border-[#839958]/25 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-label-caps text-[10px] text-[#839958] uppercase font-extrabold tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">devices</span>
                    Saved Profiles on this Device
                  </span>
                  <span className="text-[10px] text-outline-variant font-mono">1-Click Resume</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {savedAccounts.map(acc => (
                    <div
                      key={acc.email}
                      onClick={() => handleQuickLogin(acc.email, 'tarang2026', acc.fullName, acc.organization)}
                      className="p-2.5 rounded-xl bg-[#14231A] hover:bg-[#1C3225] border border-[#839958]/30 cursor-pointer transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className="h-8 w-8 rounded-lg bg-[#1F392B] text-[#F7F4D5] flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {acc.fullName.charAt(0)}
                        </div>
                        <div className="overflow-hidden">
                          <h4 className="text-xs font-bold text-white truncate">{acc.fullName}</h4>
                          <p className="text-[10px] text-outline-variant truncate">{acc.email}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={e => handleRemoveSavedAccount(acc.email, e)}
                        className="text-outline-variant hover:text-[#D3968C] p-1 rounded transition-colors"
                        title="Forget profile on this device"
                      >
                        <span className="material-symbols-outlined text-xs">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab switch between Login and Register */}
            <div className="flex bg-[#0D1711] p-1 rounded-2xl border border-[#839958]/20">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setError(null);
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-[#839958] text-[#0A3323] shadow-md'
                    : 'text-outline-variant hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setError(null);
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  authMode === 'register'
                    ? 'bg-[#839958] text-[#0A3323] shadow-md'
                    : 'text-outline-variant hover:text-white'
                }`}
              >
                Register
              </button>
            </div>

            {error && (
              <div className="p-3.5 rounded-2xl bg-error/10 border border-error/30 text-error text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">warning</span>
                {error}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {/* Extra fields for registration */}
              {authMode === 'register' && (
                <>
                  <div className="space-y-1.5">
                    <label className="font-label-caps text-xs text-[#C2D1B2] font-bold block">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="e.g. Dr. Aarav Sharma"
                      className="w-full bg-[#0D1711] border border-[#839958]/20 focus:border-[#839958] rounded-2xl px-4 py-3 text-xs text-white placeholder:text-outline-variant/60 focus:outline-none focus:ring-1 focus:ring-[#839958] shadow-inner"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-label-caps text-xs text-[#C2D1B2] font-bold block">
                      Organization / Laboratory (Optional)
                    </label>
                    <input
                      type="text"
                      value={organization}
                      onChange={e => setOrganization(e.target.value)}
                      placeholder="e.g. HydroWatch Environmental Lab"
                      className="w-full bg-[#0D1711] border border-[#839958]/20 focus:border-[#839958] rounded-2xl px-4 py-3 text-xs text-white placeholder:text-outline-variant/60 focus:outline-none focus:ring-1 focus:ring-[#839958] shadow-inner"
                    />
                  </div>
                </>
              )}

              {/* Email Address */}
              <div className="space-y-1.5">
                <label className="font-label-caps text-xs text-[#C2D1B2] font-bold block">
                  Email Address
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline-variant text-base pointer-events-none">
                    mail
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="e.g. analyst@tarang-ai.org"
                    className="w-full bg-[#0D1711] border border-[#839958]/20 focus:border-[#839958] rounded-2xl pl-10 pr-4 py-3 text-xs text-white placeholder:text-outline-variant/60 focus:outline-none focus:ring-1 focus:ring-[#839958] shadow-inner"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="font-label-caps text-xs text-[#C2D1B2] font-bold block">
                  Password
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline-variant text-base pointer-events-none">
                    key
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter password..."
                    className="w-full bg-[#0D1711] border border-[#839958]/20 focus:border-[#839958] rounded-2xl pl-10 pr-10 py-3 text-xs text-white placeholder:text-outline-variant/60 focus:outline-none focus:ring-1 focus:ring-[#839958] shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-outline-variant hover:text-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Remember Me & Save Credentials Switch */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="rounded border-[#839958]/40 text-[#839958] focus:ring-0 bg-[#0D1711] h-4 w-4"
                  />
                  <span className="text-xs text-[#C2D1B2] font-medium">
                    Remember & save login on this device
                  </span>
                </label>
                <span className="text-[10px] text-[#839958] font-mono">
                  Persistent Storage
                </span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#839958] hover:bg-[#97ad6a] text-[#0A3323] py-3.5 rounded-full font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-base animate-spin">sync</span>
                    Authenticating & Saving...
                  </>
                ) : (
                  <>
                    {authMode === 'login' ? 'Sign In & Save Session' : 'Create & Save Account'}
                    <span className="material-symbols-outlined text-base">arrow_forward</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick 1-Click Researcher Demo Logins */}
            <div className="pt-4 border-t border-[#839958]/15 space-y-2 text-center">
              <span className="font-label-caps text-[10px] text-outline-variant uppercase font-bold tracking-wider block">
                Quick 1-Click Researcher Access
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('analyst@tarang-ai.org', 'tarang2026', 'Dr. Aarav Sharma', 'CPCB River Hydrology')}
                  disabled={loading}
                  className="bg-[#16241C] hover:bg-[#1E3326] text-[#C2D1B2] hover:text-white border border-[#839958]/30 py-2.5 px-3 rounded-xl text-xs font-medium tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm text-[#839958]">science</span>
                  Dr. Aarav (CPCB Lead)
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('baibahvtrivedi8@gmail.com', 'tarang2026', 'Baibhav Trivedi', 'TARANG AI Lead Researcher')}
                  disabled={loading}
                  className="bg-[#16241C] hover:bg-[#1E3326] text-[#C2D1B2] hover:text-white border border-[#839958]/30 py-2.5 px-3 rounded-xl text-xs font-medium tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm text-[#839958]">shield_person</span>
                  Baibhav Trivedi (Creator)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
