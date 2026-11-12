import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest, apiRequestWithMeta, ApiError } from '../api/client';
import { Project, Release, ReleaseChannel, ReleaseStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatBytes, formatDate } from '../utils/format';
import { ChannelBadge } from '../components/ChannelBadge';
import { ReleaseStatusBadge } from '../components/ReleaseStatusBadge';
import {
  AlertCircle,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Layers,
  Search,
  Send,
  ShieldCheck,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';

const CHANNELS: ReleaseChannel[] = ['DEV', 'QA', 'STAGING', 'BETA', 'PRODUCTION'];
const STATUSES: ReleaseStatus[] = [
  'DRAFT',
  'UPLOADED',
  'PENDING_APPROVAL',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
  'DEPRECATED',
  'ARCHIVED',
];

interface ListMeta {
  page: number;
  limit: number;
  total: number;
}

export const Releases: React.FC = () => {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'DEVELOPER';

  const [releases, setReleases] = useState<Release[]>([]);
  const [meta, setMeta] = useState<ListMeta>({ page: 1, limit: 25, total: 0 });
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Release | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<ReleaseChannel>('STAGING');

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<any>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(meta.limit),
        sortBy,
        order,
      });
      if (search) params.set('search', search);
      if (projectId) params.set('projectId', projectId);
      if (channel) params.set('channel', channel);
      if (status) params.set('status', status);

      const result = await apiRequestWithMeta<Release[]>(`/releases?${params.toString()}`);
      setReleases(result.data);
      setMeta({
        page: result.meta?.page || page,
        limit: result.meta?.limit || meta.limit,
        total: result.meta?.total ?? result.data.length,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load releases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiRequest<Project[]>('/projects').then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [page, projectId, channel, status, sortBy, order]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    load();
  };

  const toggleCompare = (id: string) => {
    setComparison(null);
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length === 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const compare = async () => {
    if (compareIds.length !== 2) return;
    const left = releases.find((item) => item.id === compareIds[0]);
    const right = releases.find((item) => item.id === compareIds[1]);
    if (!left || !right) return;
    if (left.appId !== right.appId) {
      setActionError('Both releases must belong to the same application to compare them.');
      return;
    }
    try {
      setActionBusy(true);
      const result = await apiRequest<any>(
        `/apps/${left.appId}/releases/compare?left=${left.id}&right=${right.id}`
      );
      setComparison(result);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Comparison failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const act = async (release: Release, action: string, body?: object) => {
    try {
      setActionBusy(true);
      setActionError(null);
      const updated = await apiRequest<Release>(`/apps/${release.appId}/releases/${release.id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      setSelected(updated);
      setReleases((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setShowReject(false);
      setRejectReason('');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(meta.total / meta.limit));

  const actions = useMemo(() => {
    if (!selected || !canWrite) return [];
    const list: Array<{ label: string; action: string; tone: string }> = [];
    if (['DRAFT', 'UPLOADED', 'REJECTED'].includes(selected.status)) {
      list.push({ label: 'Submit for approval', action: 'submit', tone: 'indigo' });
    }
    if (selected.status === 'PENDING_APPROVAL') {
      list.push({ label: 'Approve', action: 'approve', tone: 'emerald' });
    }
    if (selected.status === 'APPROVED') {
      list.push({ label: 'Publish', action: 'publish', tone: 'emerald' });
    }
    if (['PUBLISHED', 'APPROVED'].includes(selected.status)) {
      list.push({ label: 'Deprecate', action: 'deprecate', tone: 'amber' });
    }
    return list;
  }, [selected, canWrite]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Release Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Search, filter and govern the full release lifecycle across every authorized project.
          </p>
        </div>
        <button
          onClick={compare}
          disabled={compareIds.length !== 2 || actionBusy}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-slate-200 text-sm font-medium rounded-xl flex items-center gap-2 self-start"
        >
          <ArrowLeftRight className="w-4 h-4" />
          Compare selected ({compareIds.length}/2)
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <form onSubmit={submitSearch} className="grid gap-3 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search version, notes or app"
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            value={channel}
            onChange={(event) => {
              setChannel(event.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200"
          >
            <option value="">All channels</option>
            {CHANNELS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200"
          >
            <option value="">All statuses</option>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={`${sortBy}:${order}`}
              onChange={(event) => {
                const [nextSort, nextOrder] = event.target.value.split(':');
                setSortBy(nextSort);
                setOrder(nextOrder);
              }}
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200"
            >
              <option value="createdAt:desc">Newest</option>
              <option value="createdAt:asc">Oldest</option>
              <option value="versionCode:desc">Version code ↓</option>
              <option value="publishedAt:desc">Recently published</option>
              <option value="downloadCount:desc">Most downloaded</option>
            </select>
            <button className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm">Go</button>
          </div>
        </form>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-400">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
          Loading releases...
        </div>
      ) : releases.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-14 text-center">
          <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-200">No releases match your filters</h3>
          <p className="text-sm text-slate-500 mt-1">Adjust the search, project, channel or status filters.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3 w-8" />
                  <th className="py-3 px-3">Application</th>
                  <th className="py-3 px-3">Version</th>
                  <th className="py-3 px-3">Channel</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Size</th>
                  <th className="py-3 px-3">Created</th>
                  <th className="py-3 px-3 text-right">Downloads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {releases.map((release) => (
                  <tr
                    key={release.id}
                    onClick={() => {
                      setSelected(release);
                      setActionError(null);
                    }}
                    className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={compareIds.includes(release.id)}
                        onChange={() => toggleCompare(release.id)}
                        className="accent-indigo-500"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-100">{release.app?.name || release.appId}</div>
                      <div className="text-[11px] font-mono text-slate-500">{release.app?.packageName}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono text-slate-200">v{release.version}</div>
                      <div className="text-[11px] text-slate-500">code {release.versionCode}</div>
                    </td>
                    <td className="py-3 px-3">
                      <ChannelBadge channel={release.channel} size="sm" />
                    </td>
                    <td className="py-3 px-3">
                      <ReleaseStatusBadge status={release.status} />
                    </td>
                    <td className="py-3 px-3 text-slate-400">{formatBytes(release.fileSize)}</td>
                    <td className="py-3 px-3 text-slate-400">{formatDate(release.createdAt)}</td>
                    <td className="py-3 px-3 text-right text-slate-400">{release.downloadCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 text-xs text-slate-400">
            <span>
              Page {meta.page} of {pageCount} · {meta.total} releases
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg bg-slate-800 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={page >= pageCount}
                className="p-1.5 rounded-lg bg-slate-800 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-xl h-full bg-slate-900 border-l border-slate-800 overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {selected.app?.name} v{selected.version}
                </h2>
                <div className="flex items-center gap-2 mt-2">
                  <ChannelBadge channel={selected.channel} size="sm" />
                  <ReleaseStatusBadge status={selected.status} />
                  {selected.isMandatory && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-950/60 text-rose-300 border border-rose-800">
                      Mandatory
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {actionError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs mb-5">
              {[
                ['Version code', String(selected.versionCode)],
                ['APK size', formatBytes(selected.fileSize)],
                ['Uploaded by', selected.uploadedBy?.name || 'Unknown'],
                ['Approved by', selected.approvedBy?.name || '—'],
                ['Published', selected.publishedAt ? formatDate(selected.publishedAt) : 'Not published'],
                ['Created', formatDate(selected.createdAt)],
                ['Git commit', selected.gitCommitSha?.slice(0, 12) || '—'],
                ['Pipeline', selected.gitlabPipelineId || '—'],
                ['Minimum supported', selected.minSupportedVersionCode ? String(selected.minSupportedVersionCode) : '—'],
                ['Downloads', String(selected.downloadCount)],
              ].map(([label, value]) => (
                <div key={label} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
                  <div className="text-slate-200 mt-1 break-all">{value}</div>
                </div>
              ))}
            </div>

            <div className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Release notes</h3>
              <p className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                {selected.releaseNotes || 'No release notes.'}
              </p>
            </div>

            <div className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">SHA-256</h3>
              <code className="block text-[11px] font-mono text-emerald-400 break-all bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                {selected.sha256}
              </code>
            </div>

            {canWrite && (
              <div className="mb-5 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lifecycle actions</h3>
                <div className="flex flex-wrap gap-2">
                  {actions.map((item) => (
                    <button
                      key={item.action}
                      disabled={actionBusy}
                      onClick={() => act(selected, item.action)}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" /> {item.label}
                    </button>
                  ))}
                  {selected.status === 'PENDING_APPROVAL' && (
                    <button
                      disabled={actionBusy}
                      onClick={() => setShowReject((value) => !value)}
                      className="px-3 py-2 bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-medium rounded-lg flex items-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  )}
                </div>

                {showReject && (
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                    <textarea
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Rejection reason (required)"
                      rows={2}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                    />
                    <button
                      disabled={!rejectReason.trim() || actionBusy}
                      onClick={() => act(selected, 'reject', { reason: rejectReason })}
                      className="px-3 py-1.5 bg-rose-600 disabled:opacity-40 text-white text-xs rounded-lg"
                    >
                      Confirm rejection
                    </button>
                  </div>
                )}

                {!['ARCHIVED'].includes(selected.status) && (
                  <div className="flex flex-wrap items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <span className="text-xs text-slate-400">Promote to</span>
                    <select
                      value={promoteTarget}
                      onChange={(event) => setPromoteTarget(event.target.value as ReleaseChannel)}
                      className="px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
                    >
                      {CHANNELS.filter((item) => item !== selected.channel).map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={actionBusy}
                      onClick={() => act(selected, 'promote', { channel: promoteTarget })}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg flex items-center gap-1.5"
                    >
                      <UploadCloud className="w-3.5 h-3.5" /> Promote
                    </button>
                  </div>
                )}
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Approval & status history
              </h3>
              <div className="space-y-2">
                {(selected.statusHistory || []).length === 0 ? (
                  <p className="text-xs text-slate-500">No lifecycle history recorded.</p>
                ) : (
                  selected.statusHistory!.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 text-xs border-l-2 border-indigo-600/40 pl-3">
                      <div className="flex-1">
                        <div className="text-slate-200">
                          {entry.fromStatus ? `${entry.fromStatus} → ` : ''}
                          {entry.toStatus}
                        </div>
                        <div className="text-slate-500">
                          {entry.changedBy?.name || 'System'} · {formatDate(entry.createdAt)}
                          {entry.reason ? ` · ${entry.reason}` : ''}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comparison modal */}
      {comparison && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-indigo-400" /> Release comparison
              </h3>
              <button onClick={() => setComparison(null)} className="text-slate-400 hover:text-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              {[comparison.left, comparison.right].map((release: Release, index: number) => (
                <div key={release.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-sm font-bold text-slate-100">
                    {index === 0 ? 'Left' : 'Right'} · v{release.version}
                  </div>
                  <div>Version code: {release.versionCode}</div>
                  <div>Channel: {release.channel}</div>
                  <div>Status: {release.status}</div>
                  <div>Size: {formatBytes(release.fileSize)}</div>
                  <div>SHA-256: {release.sha256.slice(0, 12)}…</div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300">
              Newer release: {comparison.newer === 'left' ? 'Left' : comparison.newer === 'right' ? 'Right' : 'Equal'} ·
              Version code delta: {comparison.versionCodeDelta} · Size delta: {formatBytes(Math.abs(comparison.sizeDelta))} ·
              APK changed: {comparison.fileSizeChanged ? 'Yes' : 'No'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
