import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Smartphone,
  KeyRound,
  History,
  FileCode2,
  Users as UsersIcon,
} from 'lucide-react';

export type NavTab = 'dashboard' | 'apps' | 'tokens' | 'audit' | 'docs' | 'users';

interface Props {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<Props> = ({ currentTab, onSelectTab }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const canManageTokens = user?.role === 'ADMIN' || user?.role === 'DEVELOPER';

  const navItems = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'apps' as NavTab, label: 'Applications', icon: Smartphone },
    ...(canManageTokens ? [{ id: 'tokens' as NavTab, label: 'API Tokens', icon: KeyRound }] : []),
    ...(isAdmin ? [{ id: 'audit' as NavTab, label: 'Audit Logs', icon: History }] : []),
    { id: 'docs' as NavTab, label: 'CI/CD & API Docs', icon: FileCode2 },
    ...(isAdmin ? [{ id: 'users' as NavTab, label: 'User Management', icon: UsersIcon }] : []),
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/50 p-4 flex flex-col justify-between min-h-[calc(100vh-4rem)]">
      <div className="space-y-1">
        <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Platform Menu
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-300">Relixor v1.0.0</span>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Production Artifact Repository. Local persistent storage engine active.
        </p>
      </div>
    </aside>
  );
};
