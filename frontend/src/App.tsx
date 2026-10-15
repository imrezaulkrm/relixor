import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Apps } from './pages/Apps';
import { AppDetails } from './pages/AppDetails';
import { Tokens } from './pages/Tokens';
import { Users } from './pages/Users';
import { AuditLogs } from './pages/AuditLogs';
import { CiCdDocs } from './pages/CiCdDocs';

import { ShieldAlert } from 'lucide-react';

const AccessDenied: React.FC<{ message: string; onBack: () => void }> = ({ message, onBack }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-md mx-auto mt-12">
    <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
      <ShieldAlert className="w-6 h-6" />
    </div>
    <h3 className="text-lg font-bold text-slate-100 mb-1">Access Denied</h3>
    <p className="text-sm text-slate-400 mb-6">{message}</p>
    <button
      onClick={onBack}
      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
    >
      Return to Dashboard
    </button>
  </div>
);

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
    return window.location.pathname === '/login' ? <Login /> : <Home />;
  }

  const isAdmin = user.role === 'ADMIN';
  const canManageTokens = user.role === 'ADMIN' || user.role === 'DEVELOPER';

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

          {currentTab === 'tokens' && (
            canManageTokens ? (
              <Tokens />
            ) : (
              <AccessDenied
                message="API Token management requires Developer or Administrator privileges."
                onBack={() => handleSelectTab('dashboard')}
              />
            )
          )}

          {currentTab === 'users' && (
            isAdmin ? (
              <Users />
            ) : (
              <AccessDenied
                message="User Management requires Administrator privileges."
                onBack={() => handleSelectTab('dashboard')}
              />
            )
          )}

          {currentTab === 'audit' && (
            isAdmin ? (
              <AuditLogs />
            ) : (
              <AccessDenied
                message="System Audit Logs require Administrator privileges."
                onBack={() => handleSelectTab('dashboard')}
              />
            )
          )}

          {currentTab === 'docs' && <CiCdDocs />}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return <AppContent />;
}
