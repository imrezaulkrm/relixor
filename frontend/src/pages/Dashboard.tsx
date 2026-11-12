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
  ClipboardCheck,
  ShieldAlert,
  Rocket,
} from 'lucide-react';

interface RoleOverview {
  totals: { pendingApprovals: number; users: number | null; downloads: number; releases: number };
  pendingQaVerifications: number;
  qaReleases: Array<{ id: string; version: string; channel: string; app: { id: string; name: string } }>;
  recentPublications: Array<{ id: string; version: string; publishedAt: string; app: { id: string; name: string } }>;
  securityEvents: Array<{ id: string; action: string; createdAt: string; user?: { name: string } | null }>;
  assignedProjects: Array<{ id: string; name: string; _count?: { apps: number } }>;
}

interface Props {
  onNavigateToApp: (appId: string) => void;
  onNavigateTab: (tab: 'apps' | 'tokens' | 'docs' | 'audit' | 'releases' | 'qa') => void;
}

export const Dashboard: React.FC<Props> = ({ onNavigateToApp, onNavigateTab }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [overview, setOverview] = useState<RoleOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiRequest<DashboardStats>('/stats/dashboard'),
      apiRequest<RoleOverview>('/stats/overview'),
    ])
      .then(([dashboard, roleOverview]) => {
        setStats(dashboard);
        setOverview(roleOverview);
      })
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

      {/* Role-specific operational overview */}
      {overview && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-amber-400" /> Approvals & QA queue
              </h2>
              <button onClick={() => onNavigateTab('releases')} className="text-[11px] text-indigo-400 hover:text-indigo-300">
                Open releases
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Pending approval</div>
                <div className="text-2xl font-bold text-amber-300">{overview.totals.pendingApprovals}</div>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">QA pending</div>
                <div className="text-2xl font-bold text-sky-300">{overview.pendingQaVerifications}</div>
              </div>
            </div>
            {overview.qaReleases.length === 0 ? (
              <p className="text-xs text-slate-500">No QA-approved releases awaiting distribution.</p>
            ) : (
              overview.qaReleases.slice(0, 3).map((release) => (
                <div key={release.id} className="flex items-center justify-between text-xs py-1.5 border-t border-slate-800/60">
                  <span className="text-slate-300">{release.app.name}</span>
                  <span className="font-mono text-slate-500">v{release.version}</span>
                </div>
              ))
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
              <Rocket className="w-4 h-4 text-emerald-400" /> Recent publications
            </h2>
            {overview.recentPublications.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No production publications yet.</p>
            ) : (
              overview.recentPublications.slice(0, 4).map((release) => (
                <div key={release.id} className="flex items-center justify-between text-xs py-2 border-b border-slate-800/60">
                  <div>
                    <div className="text-slate-200">{release.app.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">v{release.version}</div>
                  </div>
                  <span className="text-slate-500 text-[10px]">{formatDate(release.publishedAt)}</span>
                </div>
              ))
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-rose-400" /> Security activity
            </h2>
            {overview.securityEvents.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No security events visible for your role.</p>
            ) : (
              overview.securityEvents.slice(0, 4).map((event) => (
                <div key={event.id} className="text-xs py-2 border-b border-slate-800/60">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-mono">{event.action}</span>
                    <span className="text-slate-500 text-[10px]">{formatDate(event.createdAt)}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">{event.user?.name || 'System'}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

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
