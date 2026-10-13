import React, { useState, useEffect } from 'react';
import { apiRequest, ApiError } from '../api/client';
import { ApiTokenItem, AppItem, TokenPermission } from '../types';
import { formatDate } from '../utils/format';
import {
  KeyRound,
  Plus,
  Trash2,
  Ban,
  Check,
  Copy,
  AlertTriangle,
  X,
  ShieldCheck,
  Layers,
} from 'lucide-react';

export const Tokens: React.FC = () => {
  const [tokens, setTokens] = useState<ApiTokenItem[]>([]);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [permission, setPermission] = useState<TokenPermission>('WRITE');
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [expiresInDays, setExpiresInDays] = useState<number | ''>(90);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // New Token Display Modal State (Secret Plaintext Token)
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tokensData, appsData] = await Promise.all([
        apiRequest<ApiTokenItem[]>('/tokens'),
        apiRequest<AppItem[]>('/apps'),
      ]);
      setTokens(tokensData);
      setApps(appsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);

    try {
      const response = await apiRequest<{
        plaintextToken: string;
      }>('/tokens', {
        method: 'POST',
        body: JSON.stringify({
          name: tokenName,
          permission,
          appId: selectedAppId || null,
          expiresInDays: expiresInDays ? Number(expiresInDays) : null,
        }),
      });

      setIsCreateOpen(false);
      setTokenName('');
      setSelectedAppId('');
      setExpiresInDays(90);

      // Show secret copy modal
      setNewlyCreatedToken(response.plaintextToken);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to create API token');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    if (!confirm('Are you sure you want to revoke this API token? Any pipeline using it will be blocked immediately.')) {
      return;
    }

    try {
      await apiRequest(`/tokens/${tokenId}/revoke`, { method: 'PUT' });
      setTokens((prev) =>
        prev.map((t) => (t.id === tokenId ? { ...t, revoked: true } : t))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke token');
    }
  };

  const handleDelete = async (tokenId: string) => {
    if (!confirm('Delete this token record permanently?')) return;

    try {
      await apiRequest(`/tokens/${tokenId}`, { method: 'DELETE' });
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete token');
    }
  };

  const handleCopySecret = () => {
    if (!newlyCreatedToken) return;
    navigator.clipboard.writeText(newlyCreatedToken);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">API Tokens</h1>
          <p className="text-sm text-slate-400 mt-1">
            Generate scoped tokens for GitLab CI/CD, GitHub Actions, Jenkins, and automated release scripts.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Generate API Token</span>
        </button>
      </div>

      {/* Security Tip Box */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 leading-relaxed">
          <strong className="text-slate-200">Zero Plaintext Storage:</strong> Relixor never stores unhashed API keys. Tokens are hashed with SHA-256 upon generation. Keep your secret key safe; you will only be shown the full key once upon creation.
        </div>
      </div>

      {/* Tokens List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
          Loading tokens...
        </div>
      ) : tokens.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-md mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
            <KeyRound className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-100 mb-1">No API Tokens Active</h3>
          <p className="text-sm text-slate-400 mb-6">
            Generate an API token to integrate your CI/CD build pipelines.
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Token</span>
          </button>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Token Name</th>
                  <th className="py-3.5 px-4">Prefix</th>
                  <th className="py-3.5 px-4">Permission</th>
                  <th className="py-3.5 px-4">Scope</th>
                  <th className="py-3.5 px-4">Expires</th>
                  <th className="py-3.5 px-4">Last Used</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {tokens.map((token) => (
                  <tr key={token.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-100">
                      {token.name}
                      {token.user && (
                        <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                          Created by {token.user.name}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {token.tokenPrefix}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded font-mono font-semibold text-[11px] bg-slate-800 border border-slate-700 text-indigo-300">
                        {token.permission}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {token.app ? (
                        <span className="text-slate-300 flex items-center gap-1 font-mono text-[11px]">
                          <Layers className="w-3 h-3 text-slate-500" />
                          {token.app.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">All Apps</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {token.expiresAt ? formatDate(token.expiresAt) : <span className="text-slate-500">Never</span>}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {token.lastUsedAt ? formatDate(token.lastUsedAt) : <span className="text-slate-500">Never</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      {token.revoked ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/60 text-rose-300 border border-rose-800">
                          Revoked
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!token.revoked && (
                          <button
                            onClick={() => handleRevoke(token.id)}
                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Revoke Token"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(token.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Delete Token"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Token Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white mb-1">Generate API Token</h3>
            <p className="text-sm text-slate-400 mb-6">
              Create an authentication key for CI/CD pipelines.
            </p>

            {createError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateToken} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Token Name *
                </label>
                <input
                  type="text"
                  required
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="e.g. GitLab CI/CD Release Runner"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Permission Level *
                </label>
                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value as TokenPermission)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="WRITE">WRITE — Publish & download APK releases (Recommended for CI)</option>
                  <option value="READ">READ — Read and download artifacts only</option>
                  <option value="ADMIN">ADMIN — Full administration access</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  App Scope
                </label>
                <select
                  value={selectedAppId}
                  onChange={(e) => setSelectedAppId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="">All Applications (Global)</option>
                  {apps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name} ({app.packageName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Expiration
                </label>
                <select
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value={30}>30 Days</option>
                  <option value={90}>90 Days</option>
                  <option value={365}>1 Year (365 Days)</option>
                  <option value="">Never Expires</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {creating ? 'Generating...' : 'Generate Token'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Secret Token Display Modal (Copy Once!) */}
      {newlyCreatedToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-2xl p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-lg font-bold text-white">Save Your API Token Now</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              This is the <strong>only time</strong> you will be shown the secret token key. Please copy and store it securely in your GitLab CI/CD Variables, GitHub Secrets, or secret manager.
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2 mb-6">
              <code className="text-xs font-mono text-emerald-400 break-all select-all">
                {newlyCreatedToken}
              </code>
              <button
                onClick={handleCopySecret}
                className="flex-shrink-0 p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium"
              >
                {copiedSecret ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setNewlyCreatedToken(null)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                I Have Saved My Token
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
