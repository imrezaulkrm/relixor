import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { DashboardStats } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatBytes, formatDate } from '../utils/format';
import { ChannelBadge } from '../components/ChannelBadge';
import {
  Smartphone,
  Layers,
  Download,
  HardDrive,
  ArrowUpRight,
  TrendingUp,
  Activity,
} from 'lucide-react';

interface Props {
  onNavigateToApp: (appId: string) => void;
  onNavigateTab: (tab: 'apps' | 'tokens' | 'docs' | 'audit') => void;
}

export const Dashboard: React.FC<Props> = ({ onNavigateToApp, onNavigateTab }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<DashboardStats>('/stats/dashboard')
      .then((data) => setStats(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Loading dashboard metrics...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Welcome / Headline */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Overview Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time status of your private APK artifacts, distribution metrics, and releases.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateTab('apps')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
          >
            <span>Manage Apps</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Apps */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Apps</span>
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Smartphone className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-white">{stats.totalApps}</div>
            <p className="text-xs text-slate-500 mt-1">Configured app repositories</p>
          </div>
        </div>

        {/* Total Releases */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Releases</span>
            <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-white">{stats.totalReleases}</div>
            <p className="text-xs text-slate-500 mt-1">Across all release channels</p>
          </div>
        </div>

        {/* Total Downloads */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Downloads</span>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Download className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-white">{stats.totalDownloads}</div>
            <p className="text-xs text-slate-500 mt-1">Authorized APK downloads</p>
          </div>
        </div>

        {/* Storage Usage */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Storage Used</span>
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <HardDrive className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-white">{formatBytes(stats.storageBytes)}</div>
            <p className="text-xs text-slate-500 mt-1">Persistent disk footprint</p>
          </div>
        </div>
      </div>

      {/* Channel Distribution Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-400" />
          Release Channels Breakdown
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Production</span>
              <ChannelBadge channel="PRODUCTION" size="sm" />
            </div>
            <div className="text-2xl font-bold text-white">{stats.channelCounts.PRODUCTION || 0}</div>
          </div>
          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Staging</span>
              <ChannelBadge channel="STAGING" size="sm" />
            </div>
            <div className="text-2xl font-bold text-white">{stats.channelCounts.STAGING || 0}</div>
          </div>
          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">QA</span>
              <ChannelBadge channel="QA" size="sm" />
            </div>
            <div className="text-2xl font-bold text-white">{stats.channelCounts.QA || 0}</div>
          </div>
          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Dev</span>
              <ChannelBadge channel="DEV" size="sm" />
            </div>
            <div className="text-2xl font-bold text-white">{stats.channelCounts.DEV || 0}</div>
          </div>
        </div>
      </div>

      {/* Two Columns: Recent Releases & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Releases */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              Recent Releases
            </h2>
            <button
              onClick={() => onNavigateTab('apps')}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
            >
              View all apps
            </button>
          </div>

          {stats.recentReleases.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No releases published yet.</p>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {stats.recentReleases.map((rel) => (
                <div
                  key={rel.id}
                  onClick={() => onNavigateToApp(rel.app.id)}
                  className="py-3 flex items-center justify-between group cursor-pointer hover:bg-slate-800/30 px-2 rounded-xl transition-colors"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100 group-hover:text-indigo-400 transition-colors">
                        {rel.app.name}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">v{rel.version}</span>
                      <ChannelBadge channel={rel.channel} size="sm" />
                    </div>
                    <span className="text-xs text-slate-500 mt-0.5">
                      {formatBytes(rel.fileSize)} • {formatDate(rel.createdAt)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Download className="w-3.5 h-3.5" />
                      {rel.downloadCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity Audit Logs */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Recent Release History & Activity
            </h2>
            {user?.role === 'ADMIN' && (
              <button
                onClick={() => onNavigateTab('audit')}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
              >
                Full audit log
              </button>
            )}
          </div>

          {stats.recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No recent activity recorded.</p>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {stats.recentActivity.slice(0, 6).map((log) => (
                <div key={log.id} className="py-2.5 flex items-start justify-between text-xs">
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-200">
                      <span className="font-mono text-indigo-400 mr-2">{log.action}</span>
                      {log.user ? log.user.name : 'Automated Pipeline'}
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5">
                      {log.entityType} {log.app ? `• ${log.app.name}` : ''}
                    </span>
                  </div>
                  <span className="text-slate-500 text-[11px] flex-shrink-0">
                    {formatDate(log.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
