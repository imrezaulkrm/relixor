import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Apps } from './pages/Apps';
import { AppDetails } from './pages/AppDetails';
import { Tokens } from './pages/Tokens';
import { Users } from './pages/Users';
import { AuditLogs } from './pages/AuditLogs';
import { CiCdDocs } from './pages/CiCdDocs';

export const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex items-center gap-3 text-sm">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Initializing Relixor platform...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const handleSelectTab = (tab: NavTab) => {
    setSelectedAppId(null);
    setCurrentTab(tab);
  };

  const handleSelectApp = (appId: string) => {
    setSelectedAppId(appId);
    setCurrentTab('apps');
  };

  const handleBackToApps = () => {
    setSelectedAppId(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar currentTab={currentTab} onSelectTab={handleSelectTab} />

        <main className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {currentTab === 'dashboard' && (
            <Dashboard
              onNavigateToApp={handleSelectApp}
              onNavigateTab={(tab) => {
                if (tab === 'apps') handleSelectTab('apps');
                if (tab === 'tokens') handleSelectTab('tokens');
                if (tab === 'docs') handleSelectTab('docs');
                if (tab === 'audit') handleSelectTab('audit');
              }}
            />
          )}

          {currentTab === 'apps' && (
            selectedAppId ? (
              <AppDetails appId={selectedAppId} onBack={handleBackToApps} />
            ) : (
              <Apps onSelectApp={handleSelectApp} />
            )
          )}

          {currentTab === 'tokens' && <Tokens />}
          {currentTab === 'users' && <Users />}
          {currentTab === 'audit' && <AuditLogs />}
          {currentTab === 'docs' && <CiCdDocs />}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return <AppContent />;
}
