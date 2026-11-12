import React, { useEffect, useState } from 'react';
import { apiRequest, ApiError } from '../api/client';
import { ReleaseChannel } from '../types';
import { formatBytes, formatDate } from '../utils/format';
import { ChannelBadge } from '../components/ChannelBadge';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  HardDrive,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

interface Policy {
  id: string;
  channel: ReleaseChannel;
  retentionDays: number;
  enabled: boolean;
}

interface Candidate {
  id: string;
  appName: string;
  projectName: string;
  version: string;
  channel: ReleaseChannel;
  fileSize: number;
  ageDays: number;
  retentionDays: number;
}

interface Preview {
  candidates: Candidate[];
  protectedReleases: number;
  totalBytes: number;
  deletionEnabled: boolean;
  defaultMode: string;
  channels: Array<{ channel: ReleaseChannel; retentionDays: number; enabled: boolean; candidates: number; bytes: number }>;
}

interface CleanupRun {
  id: string;
  mode: 'DRY_RUN' | 'EXECUTE';
  channel: ReleaseChannel | null;
  releasesConsidered: number;
  releasesDeleted: number;
  bytesFreed: number;
  createdAt: string;
  executedBy?: { name: string } | null;
}

interface StorageStats {
  deletionEnabled: boolean;
  totals: {
    releases: number;
    releaseBytes: number;
    diskBytes: number;
    protectedReleases: number;
    pinnedReleases: number;
    productionReleases: number;
  };
  byChannel: Array<{ channel: ReleaseChannel; releases: number; bytes: number }>;
}

export const Retention: React.FC = () => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<CleanupRun[]>([]);
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [policyData, previewData, historyData, storageData] = await Promise.all([
        apiRequest<Policy[]>('/retention/policies'),
        apiRequest<Preview>('/retention/candidates'),
        apiRequest<CleanupRun[]>('/retention/history'),
        apiRequest<StorageStats>('/retention/storage'),
      ]);
      setPolicies(policyData);
      setPreview(previewData);
      setHistory(historyData);
      setStorage(storageData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load retention settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updatePolicy = async (policy: Policy, patch: Partial<Policy>) => {
    try {
      setBusy(true);
      setError(null);
      const updated = await apiRequest<Policy>(`/retention/policies/${policy.channel}`, {
        method: 'PUT',
        body: JSON.stringify({
          retentionDays: patch.retentionDays ?? policy.retentionDays,
          enabled: patch.enabled ?? policy.enabled,
        }),
      });
      setPolicies((prev) => prev.map((item) => (item.channel === updated.channel ? updated : item)));
      setNotice(`Updated ${policy.channel} retention policy.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update retention policy.');
    } finally {
      setBusy(false);
    }
  };

  const runCleanup = async (mode: 'DRY_RUN' | 'EXECUTE') => {
    if (mode === 'EXECUTE' && !confirm('Permanently delete eligible APK files? Release metadata is preserved and archived.')) {
      return;
    }
    try {
      setBusy(true);
      setError(null);
      setNotice(null);
      const result = await apiRequest<any>('/retention/cleanup', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      setNotice(
        mode === 'DRY_RUN'
          ? `Dry run complete: ${result.considered} candidates, nothing deleted.`
          : `Cleanup complete: ${result.filesDeleted} file(s), ${formatBytes(result.bytesFreed)} freed.`
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cleanup failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
        Loading retention settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">APK Retention & Cleanup</h1>
          <p className="text-sm text-slate-400 mt-1">
            Cleanup is dry-run by default. Production, pinned and active-workflow releases are always protected.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => runCleanup('DRY_RUN')}
            disabled={busy}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium rounded-xl flex items-center gap-2 disabled:opacity-50"
          >
            <Play className="w-4 h-4" /> Dry run
          </button>
          <button
            onClick={() => runCleanup('EXECUTE')}
            disabled={busy || !preview?.deletionEnabled}
            title={preview?.deletionEnabled ? 'Execute cleanup' : 'Requires RETENTION_ALLOW_DELETE=true'}
            className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded-xl flex items-center gap-2 disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" /> Execute
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
      {notice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {notice}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ['Disk usage', storage ? formatBytes(storage.totals.diskBytes) : '—', HardDrive],
          ['Protected releases', storage?.totals.protectedReleases ?? 0, ShieldCheck],
          ['Cleanup candidates', preview?.candidates.length ?? 0, Archive],
          ['Reclaimable', preview ? formatBytes(preview.totalBytes) : '—', Trash2],
        ] as Array<[string, string | number, React.ElementType]>).map(([label, value, Icon]) => {
          const IconComponent = Icon;
          return (
            <div key={String(label)} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <IconComponent className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
                <div className="text-lg font-bold text-white">{value}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-slate-200 mb-4">Channel retention policies</h2>
        <div className="space-y-2">
          {policies.map((policy) => (
            <div
              key={policy.channel}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-3"
            >
              <div className="flex items-center gap-3">
                <ChannelBadge channel={policy.channel} size="sm" />
                <span className="text-xs text-slate-400">
                  {policy.channel === 'PRODUCTION' ? 'Never automatically deleted' : `Delete artifacts older than ${policy.retentionDays} days`}
                </span>
              </div>
              {policy.channel !== 'PRODUCTION' && (
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={3650}
                    value={policy.retentionDays}
                    onChange={(event) =>
                      setPolicies((prev) =>
                        prev.map((item) =>
                          item.channel === policy.channel
                            ? { ...item, retentionDays: Number(event.target.value) }
                            : item
                        )
                      )
                    }
                    className="w-20 px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={policy.enabled}
                      onChange={(event) => updatePolicy(policy, { enabled: event.target.checked })}
                      className="accent-indigo-500"
                    />
                    Enabled
                  </label>
                  <button
                    disabled={busy}
                    onClick={() => updatePolicy(policy, {})}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-slate-200">Cleanup preview</h2>
          <button onClick={load} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
        {!preview || preview.candidates.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No artifacts are currently eligible for cleanup.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">Application</th>
                  <th className="py-3 px-3">Version</th>
                  <th className="py-3 px-3">Channel</th>
                  <th className="py-3 px-3">Age</th>
                  <th className="py-3 px-3">Retention</th>
                  <th className="py-3 px-3 text-right">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {preview.candidates.map((candidate) => (
                  <tr key={candidate.id}>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-100">{candidate.appName}</div>
                      <div className="text-[11px] text-slate-500">{candidate.projectName}</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300">v{candidate.version}</td>
                    <td className="py-3 px-3">
                      <ChannelBadge channel={candidate.channel} size="sm" />
                    </td>
                    <td className="py-3 px-3 text-slate-400">{candidate.ageDays} days</td>
                    <td className="py-3 px-3 text-slate-400">{candidate.retentionDays} days</td>
                    <td className="py-3 px-3 text-right text-slate-400">{formatBytes(candidate.fileSize)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-slate-200">Cleanup history</h2>
        </div>
        {history.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No cleanup runs recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">Mode</th>
                  <th className="py-3 px-3">Channel</th>
                  <th className="py-3 px-3">Considered</th>
                  <th className="py-3 px-3">Deleted</th>
                  <th className="py-3 px-3">Freed</th>
                  <th className="py-3 px-3">By</th>
                  <th className="py-3 px-3">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {history.map((run) => (
                  <tr key={run.id}>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] border ${
                          run.mode === 'EXECUTE'
                            ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {run.mode}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400">{run.channel || 'All'}</td>
                    <td className="py-3 px-3 text-slate-400">{run.releasesConsidered}</td>
                    <td className="py-3 px-3 text-slate-400">{run.releasesDeleted}</td>
                    <td className="py-3 px-3 text-slate-400">{formatBytes(run.bytesFreed)}</td>
                    <td className="py-3 px-3 text-slate-400">{run.executedBy?.name || 'Scheduler'}</td>
                    <td className="py-3 px-3 text-slate-400">{formatDate(run.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
