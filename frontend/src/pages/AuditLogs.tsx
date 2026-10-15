import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { AuditLogItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/format';
import {
  History,
  Filter,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';

interface AuditLogResponse {
  logs: AuditLogItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const AuditLogs: React.FC = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams({
        page: page.toString(),
        limit: '25',
      });
      if (actionFilter) query.append('action', actionFilter);

      const data = await apiRequest<AuditLogResponse>(`/audit-logs?${query.toString()}`);
      setLogs(data.logs);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchLogs();
    }
  }, [page, actionFilter, user]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-md mx-auto">
        <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-100 mb-1">Access Denied</h3>
        <p className="text-xs text-slate-400">System Audit Logs require Administrator privileges.</p>
      </div>
    );
  }

  const getActionColor = (action: string) => {
    if (action.includes('UPLOAD')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (action.includes('DOWNLOAD')) return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
    if (action.includes('DELETE')) return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    if (action.includes('TOKEN')) return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
    return 'text-slate-300 bg-slate-800 border-slate-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Audit Logs & Release History</h1>
          <p className="text-sm text-slate-400 mt-1">
            Complete audit trail tracking all uploads, downloads, deletions, and administrative actions.
          </p>
        </div>

        {/* Action Filter */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Events</option>
            <option value="RELEASE_UPLOAD">RELEASE_UPLOAD</option>
            <option value="RELEASE_DOWNLOAD">RELEASE_DOWNLOAD</option>
            <option value="RELEASE_DELETE">RELEASE_DELETE</option>
            <option value="APP_CREATE">APP_CREATE</option>
            <option value="APP_UPDATE">APP_UPDATE</option>
            <option value="APP_DELETE">APP_DELETE</option>
            <option value="TOKEN_CREATE">TOKEN_CREATE</option>
            <option value="TOKEN_REVOKE">TOKEN_REVOKE</option>
            <option value="AUTH_LOGIN">AUTH_LOGIN</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
          Loading audit records...
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-md mx-auto">
          <History className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-100 mb-1">No Audit Records Found</h3>
          <p className="text-xs text-slate-400">
            {actionFilter ? 'No events matching the selected filter.' : 'Activity will be recorded here.'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Entity</th>
                  <th className="py-3.5 px-4">Application</th>
                  <th className="py-3.5 px-4">Triggered By</th>
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  let parsedDetails = null;
                  try {
                    parsedDetails = log.details ? JSON.parse(log.details) : null;
                  } catch {
                    parsedDetails = log.details;
                  }

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[11px] font-bold border ${getActionColor(log.action)}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                          {log.entityType}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {log.app ? log.app.name : <span className="text-slate-500">-</span>}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {log.user ? (
                            <div>
                              <span>{log.user.name}</span>
                              <span className="text-[10px] text-slate-500 block font-mono">
                                {log.user.email}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">CI / API Client</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono">
                          {formatDate(log.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {log.details && (
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 font-medium"
                            >
                              <span>{isExpanded ? 'Hide' : 'View'}</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && parsedDetails && (
                        <tr className="bg-slate-950/70">
                          <td colSpan={6} className="p-4 border-t border-slate-800/40">
                            <pre className="text-[11px] font-mono text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 overflow-x-auto">
                              {typeof parsedDetails === 'object'
                                ? JSON.stringify(parsedDetails, null, 2)
                                : parsedDetails}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Page {page} of {totalPages}</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-slate-300 transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-slate-300 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
