import React, { useEffect, useState } from 'react';
import { apiRequest, ApiError } from '../api/client';
import { formatBytes, formatDate } from '../utils/format';
import { Box, Download, Lock, Package, Search, ShieldCheck, Smartphone } from 'lucide-react';

interface PublicRelease {
  id: string;
  version: string;
  versionCode: number;
  releaseNotes: string | null;
  fileSize: number;
  sha256: string;
  publishedAt: string | null;
  downloadCount: number;
  isMandatory: boolean;
}

interface PublicApp {
  id: string;
  name: string;
  packageName: string;
  description: string | null;
  iconUrl: string | null;
  publicSlug: string | null;
  updatedAt: string;
  latestRelease: PublicRelease | null;
  releases?: PublicRelease[];
  totalDownloads?: number;
}

const slugFromPath = () => {
  const match = window.location.pathname.match(/^\/portal\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
};

export const PublicPortal: React.FC = () => {
  const [slug, setSlug] = useState<string | null>(slugFromPath());
  const [apps, setApps] = useState<PublicApp[]>([]);
  const [app, setApp] = useState<PublicApp | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const loadCatalog = async (query = '') => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<PublicApp[]>(`/public/apps?limit=60${query ? `&search=${encodeURIComponent(query)}` : ''}`);
      setApps(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the application catalog.');
    } finally {
      setLoading(false);
    }
  };

  const loadApp = async (ref: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<PublicApp>(`/public/apps/${encodeURIComponent(ref)}`);
      setApp(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Application not found.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const next = slugFromPath();
      setSlug(next);
      setApp(null);
      if (next) loadApp(next);
      else loadCatalog();
    };
    window.addEventListener('popstate', handlePopState);
    if (slug) loadApp(slug);
    else loadCatalog();
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    const next = slugFromPath();
    setSlug(next);
    if (next) loadApp(next);
    else loadCatalog();
  };

  const download = async () => {
    if (!app) return;
    try {
      setDownloading(true);
      setError(null);
      const ticket = await apiRequest<{ downloadUrl: string }>(
        `/public/apps/${app.publicSlug || app.id}/download-ticket`,
        { method: 'POST' }
      );
      window.location.href = `${window.location.origin}${ticket.downloadUrl}`;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download is not available.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/portal')} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
              <Box className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="font-bold text-lg leading-none">Relixor</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Public APK Portal</div>
            </div>
          </button>
          <button
            onClick={() => {
              window.location.href = '/login';
            }}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" /> Internal sign in
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        {error && (
          <div className="mb-5 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-32 text-sm text-slate-400">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
            Loading public applications...
          </div>
        ) : !slug ? (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white tracking-tight">Public application catalog</h1>
              <p className="text-sm text-slate-400 mt-2">
                Only production releases that have completed approval and publication are available here.
              </p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                loadCatalog(search);
              }}
              className="relative max-w-md mb-6"
            >
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search applications"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </form>

            {apps.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center">
                <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-200">No public applications</h3>
                <p className="text-sm text-slate-500 mt-1">Applications appear here once an administrator publishes them.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {apps.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/portal/${item.publicSlug || item.id}`)}
                    className="text-left bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                        {item.iconUrl ? (
                          <img src={item.iconUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Smartphone className="w-5 h-5 text-indigo-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-100 truncate">{item.name}</div>
                        <div className="text-[11px] font-mono text-slate-500 truncate">{item.packageName}</div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 min-h-[2.5rem]">
                      {item.description || 'No description provided.'}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-[11px]">
                      {item.latestRelease ? (
                        <span className="text-emerald-300 font-mono">v{item.latestRelease.version}</span>
                      ) : (
                        <span className="text-slate-500">No published release</span>
                      )}
                      <span className="text-slate-500">{formatBytes(item.latestRelease?.fileSize || 0)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : app ? (
          <>
            <button onClick={() => navigate('/portal')} className="text-xs text-indigo-400 hover:text-indigo-300 mb-5">
              ← Back to catalog
            </button>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-5">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-start gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {app.iconUrl ? (
                      <img src={app.iconUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Smartphone className="w-7 h-7 text-indigo-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-white">{app.name}</h1>
                    <div className="text-xs font-mono text-slate-500 mt-0.5">{app.packageName}</div>
                    <p className="text-sm text-slate-300 mt-3">{app.description || 'No description provided.'}</p>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h2 className="text-sm font-bold text-slate-200 mb-3">Release history</h2>
                  {(app.releases || []).length === 0 ? (
                    <p className="text-sm text-slate-500">No published production releases.</p>
                  ) : (
                    <div className="space-y-3">
                      {app.releases!.map((release, index) => (
                        <div key={release.id} className="border border-slate-800 bg-slate-950/50 rounded-xl p-3.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-slate-100">v{release.version}</span>
                              {index === 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800">
                                  LATEST
                                </span>
                              )}
                              {release.isMandatory && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800">
                                  MANDATORY
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500">
                              {release.publishedAt ? formatDate(release.publishedAt) : ''}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-2 whitespace-pre-wrap">
                            {release.releaseNotes || 'No release notes.'}
                          </p>
                          <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                            <span>{formatBytes(release.fileSize)} · {release.downloadCount} downloads</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <h2 className="text-sm font-bold text-slate-200 mb-3">Latest version</h2>
                  {app.latestRelease ? (
                    <>
                      <div className="text-2xl font-bold text-white font-mono">v{app.latestRelease.version}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Version code {app.latestRelease.versionCode}</div>
                      <dl className="mt-4 space-y-2 text-xs">
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">APK size</dt>
                          <dd className="text-slate-200">{formatBytes(app.latestRelease.fileSize)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Published</dt>
                          <dd className="text-slate-200">
                            {app.latestRelease.publishedAt ? formatDate(app.latestRelease.publishedAt) : '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Downloads</dt>
                          <dd className="text-slate-200">{app.totalDownloads ?? app.latestRelease.downloadCount}</dd>
                        </div>
                      </dl>
                      <button
                        onClick={download}
                        disabled={downloading}
                        className="mt-4 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" /> {downloading ? 'Preparing…' : 'Download APK'}
                      </button>
                      <p className="text-[10px] text-slate-500 mt-2">
                        Downloads use a short-lived single-use link. No account token is embedded in the URL.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">No published production release.</p>
                  )}
                </div>

                {app.latestRelease && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <h2 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> SHA-256 checksum
                    </h2>
                    <code className="text-[10px] font-mono text-emerald-400 break-all">{app.latestRelease.sha256}</code>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
};
