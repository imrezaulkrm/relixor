import React, { useEffect, useState } from 'react';
import { apiRequest, ApiError, downloadFile } from '../api/client';
import { Project, ReleaseChannel } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/format';
import { ChannelBadge } from '../components/ChannelBadge';
import { ReleaseStatusBadge } from '../components/ReleaseStatusBadge';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

interface ReportRow {
  id: string;
  appId: string;
  project: string;
  application: string;
  packageName: string;
  version: string;
  versionCode: number;
  channel: ReleaseChannel;
  status: any;
  qaResult: string;
  qaReviewers: string;
  qaNotes: string;
  uploadedBy: string;
  approvedBy: string;
  createdAt: string;
  publishedAt: string;
  downloads: number;
  sha256: string;
}

interface ReportPayload {
  generatedAt: string;
  summary: {
    totalReleases: number;
    tested: number;
    notTested: number;
    failed: number;
    downloads: number;
  };
  rows: ReportRow[];
}

export const QaReports: React.FC = () => {
  const { user } = useAuth();
  const canVerify = user?.role === 'ADMIN' || user?.role === 'DEVELOPER';

  const [report, setReport] = useState<ReportPayload | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [projectId, setProjectId] = useState('');
  const [channel, setChannel] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query = () => {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    if (channel) params.set('channel', channel);
    if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString());
    return params.toString();
  };

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<ReportPayload>(`/reports/qa?${query()}`);
      setReport(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load QA report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiRequest<Project[]>('/projects').then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [projectId, channel, from, to]);

  const exportReport = async (format: 'csv' | 'pdf') => {
    try {
      setExporting(format);
      setError(null);
      await downloadFile(
        `/reports/qa/export?format=${format}&${query()}`,
        `relixor-qa-report-${new Date().toISOString().slice(0, 10)}.${format}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(null);
    }
  };

  const recordVerification = async (row: ReportRow, status: 'PASS' | 'FAIL' | 'BLOCKED') => {
    const notes = status === 'PASS' ? undefined : prompt('Optional note for this result:') || undefined;
    try {
      setVerifying(row.id);
      setError(null);
      setNotice(null);
      await apiRequest(`/apps/${row.appId}/releases/${row.id}/qa-verifications`, {
        method: 'POST',
        body: JSON.stringify({ status, notes }),
      });
      setNotice(`Recorded ${status} for ${row.application} v${row.version}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record QA verification.');
    } finally {
      setVerifying(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">QA Dashboard & Reports</h1>
          <p className="text-sm text-slate-400 mt-1">
            Only recorded verification results are shown. Nothing is inferred or auto-marked as passed.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportReport('csv')}
            disabled={!!exporting}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium rounded-xl flex items-center gap-2 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" /> {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            onClick={() => exportReport('pdf')}
            disabled={!!exporting}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl flex items-center gap-2 disabled:opacity-50"
          >
            <FileText className="w-4 h-4" /> {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
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
          onChange={(event) => setChannel(event.target.value)}
          className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200"
        >
          <option value="">All channels</option>
          {['DEV', 'QA', 'STAGING', 'BETA', 'PRODUCTION'].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200"
        />
        <input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200"
        />
        <button
          onClick={load}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm rounded-xl flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
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

      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            ['Releases', report.summary.totalReleases],
            ['Tested', report.summary.tested],
            ['Not tested', report.summary.notTested],
            ['Failures / blockers', report.summary.failed],
            ['Downloads', report.summary.downloads],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
              <div className="text-2xl font-bold text-white mt-1">{value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-400">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
          Building report...
        </div>
      ) : !report || report.rows.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-14 text-center">
          <ClipboardCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-200">No releases in this report</h3>
          <p className="text-sm text-slate-500 mt-1">Adjust the project, channel or date range.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">Application</th>
                  <th className="py-3 px-3">Version</th>
                  <th className="py-3 px-3">Channel</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">QA result</th>
                  <th className="py-3 px-3">Reviewers</th>
                  <th className="py-3 px-3">Created</th>
                  {canVerify && <th className="py-3 px-3 text-right">Record result</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {report.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-100">{row.application}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {row.project} · {row.packageName}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono text-slate-200">v{row.version}</div>
                      <div className="text-[11px] text-slate-500">code {row.versionCode}</div>
                    </td>
                    <td className="py-3 px-3">
                      <ChannelBadge channel={row.channel} size="sm" />
                    </td>
                    <td className="py-3 px-3">
                      <ReleaseStatusBadge status={row.status} />
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-medium ${
                          row.qaResult.includes('FAIL') || row.qaResult.includes('BLOCKED')
                            ? 'text-rose-300'
                            : row.qaResult === 'NOT_TESTED'
                              ? 'text-slate-500'
                              : 'text-emerald-300'
                        }`}
                      >
                        {row.qaResult}
                      </span>
                      {row.qaNotes && (
                        <div className="text-[11px] text-slate-500 max-w-[220px] truncate" title={row.qaNotes}>
                          {row.qaNotes}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-400">{row.qaReviewers || '—'}</td>
                    <td className="py-3 px-3 text-slate-400">{formatDate(row.createdAt)}</td>
                    {canVerify && (
                      <td className="py-3 px-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            title="Pass"
                            disabled={verifying === row.id}
                            onClick={() => recordVerification(row, 'PASS')}
                            className="p-1.5 rounded-lg bg-emerald-950/50 text-emerald-300 border border-emerald-800 hover:bg-emerald-900/50 disabled:opacity-40"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title="Fail"
                            disabled={verifying === row.id}
                            onClick={() => recordVerification(row, 'FAIL')}
                            className="p-1.5 rounded-lg bg-rose-950/50 text-rose-300 border border-rose-800 hover:bg-rose-900/50 disabled:opacity-40"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title="Blocked"
                            disabled={verifying === row.id}
                            onClick={() => recordVerification(row, 'BLOCKED')}
                            className="p-1.5 rounded-lg bg-amber-950/50 text-amber-300 border border-amber-800 hover:bg-amber-900/50 disabled:opacity-40"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
            <span>{report.rows.length} rows · generated {formatDate(report.generatedAt)}</span>
            <span className="flex items-center gap-1.5">
              <Download className="w-3 h-3" /> Exports are authorized and audited
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
