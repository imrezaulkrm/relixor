import React, { useState, useEffect } from 'react';
import { apiRequest, ApiError, downloadFile } from '../api/client';
import { AppItem, Release, ReleaseChannel } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatBytes, formatDate } from '../utils/format';
import { ChannelBadge } from '../components/ChannelBadge';
import { QrCodeModal } from '../components/QrCodeModal';
import {
  Smartphone,
  Upload,
  Download,
  Copy,
  Check,
  QrCode,
  Trash2,
  Edit,
  ArrowLeft,
  X,
  FileCheck2,
  AlertCircle,
  FileUp,
} from 'lucide-react';

interface Props {
  appId: string;
  onBack: () => void;
}

export const AppDetails: React.FC<Props> = ({ appId, onBack }) => {
  const { user } = useAuth();
  const canUpload = user?.role === 'ADMIN' || user?.role === 'DEVELOPER';
  const isAdmin = user?.role === 'ADMIN';

  const [app, setApp] = useState<AppItem | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<ReleaseChannel | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);

  // QR Code Modal State
  const [qrRelease, setQrRelease] = useState<Release | null>(null);

  // Checksum Copy State
  const [copiedShaId, setCopiedShaId] = useState<string | null>(null);
  const [copiedAppId, setCopiedAppId] = useState(false);

  // Upload Release Modal State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadVersionCode, setUploadVersionCode] = useState('');
  const [uploadChannel, setUploadChannel] = useState<ReleaseChannel>('DEV');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadProgress, setUploadProgress] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Edit App Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const fetchAppData = async () => {
    try {
      setLoading(true);
      const appData = await apiRequest<AppItem>(`/apps/${appId}`);
      setApp(appData);
      setEditName(appData.name);
      setEditDesc(appData.description || '');

      const channelParam = selectedChannel !== 'ALL' ? `?channel=${selectedChannel}` : '';
      const releasesData = await apiRequest<Release[]>(`/apps/${appId}/releases${channelParam}`);
      setReleases(releasesData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppData();
  }, [appId, selectedChannel]);

  const handleCopySha = (sha: string, id: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedShaId(id);
    setTimeout(() => setCopiedShaId(null), 2000);
  };

  const handleCopyAppId = () => {
    if (!app) return;
    navigator.clipboard.writeText(app.id);
    setCopiedAppId(true);
    setTimeout(() => setCopiedAppId(false), 2000);
  };

  const handleDownload = async (rel: Release) => {
    try {
      await downloadFile(`/apps/${appId}/releases/${rel.id}/download`, rel.fileName);
      // Increment local count
      setReleases((prev) =>
        prev.map((r) => (r.id === rel.id ? { ...r, downloadCount: r.downloadCount + 1 } : r))
      );
    } catch (err) {
      console.error('Download failed', err);
      alert('Failed to download release file');
    }
  };

  const handleDeleteRelease = async (rel: Release) => {
    if (!confirm(`Are you sure you want to delete release v${rel.version} (${rel.channel})? This will permanently remove the APK binary.`)) {
      return;
    }

    try {
      await apiRequest(`/apps/${appId}/releases/${rel.id}`, { method: 'DELETE' });
      setReleases((prev) => prev.filter((r) => r.id !== rel.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete release');
    }
  };

  const handleDeleteApp = async () => {
    if (!confirm(`Are you sure you want to delete ${app?.name}? ALL releases and APK binaries will be permanently deleted.`)) {
      return;
    }

    try {
      await apiRequest(`/apps/${appId}`, { method: 'DELETE' });
      onBack();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete app');
    }
  };

  const handleEditApp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await apiRequest<AppItem>(`/apps/${appId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editName, description: editDesc }),
      });
      setApp(updated);
      setIsEditOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update app');
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please select an .apk file to upload.');
      return;
    }

    setUploadError(null);
    setUploadProgress(true);

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('version', uploadVersion);
    formData.append('versionCode', uploadVersionCode);
    formData.append('channel', uploadChannel);
    formData.append('notes', uploadNotes);

    try {
      await apiRequest(`/apps/${appId}/releases`, {
        method: 'POST',
        body: formData,
      });

      setIsUploadOpen(false);
      setUploadFile(null);
      setUploadVersion('');
      setUploadVersionCode('');
      setUploadNotes('');
      fetchAppData();
    } catch (err) {
      if (err instanceof ApiError) {
        setUploadError(err.message);
      } else {
        setUploadError('Failed to publish release');
      }
    } finally {
      setUploadProgress(false);
    }
  };

  if (loading && !app) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
        Loading application details...
      </div>
    );
  }

  if (!app) return null;

  return (
    <div className="space-y-8">
      {/* Back button */}
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Applications</span>
        </button>
      </div>

      {/* App Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 shadow-lg shadow-indigo-500/10">
              <Smartphone className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-white tracking-tight">{app.name}</h1>
                <span className="text-xs bg-slate-800 border border-slate-700 text-slate-300 font-mono px-2.5 py-0.5 rounded-full">
                  {app.packageName}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
                {app.description || 'No description provided.'}
              </p>

              {/* App ID snippet for CI/CD */}
              <div className="flex items-center gap-2 mt-4 text-xs font-mono text-slate-500">
                <span>App ID:</span>
                <code className="text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {app.id}
                </code>
                <button
                  onClick={handleCopyAppId}
                  className="p-1 hover:text-slate-300 transition-colors"
                  title="Copy App ID"
                >
                  {copiedAppId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            {canUpload && (
              <button
                onClick={() => setIsUploadOpen(true)}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Publish Release</span>
              </button>
            )}

            {canUpload && (
              <button
                onClick={() => setIsEditOpen(true)}
                className="px-3.5 py-2.5 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                <span>Edit</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={handleDeleteApp}
                className="p-2.5 border border-rose-900/40 bg-rose-950/20 hover:bg-rose-900/40 text-rose-400 rounded-xl transition-colors"
                title="Delete App"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Release Channel Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {(['ALL', 'PRODUCTION', 'STAGING', 'QA', 'DEV'] as const).map((ch) => {
            const isActive = selectedChannel === ch;
            return (
              <button
                key={ch}
                onClick={() => setSelectedChannel(ch)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-slate-100 text-slate-900 shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {ch === 'ALL' ? 'All Channels' : ch}
              </button>
            );
          })}
        </div>

        <span className="text-xs text-slate-500 font-mono">
          {releases.length} {releases.length === 1 ? 'release' : 'releases'}
        </span>
      </div>

      {/* Releases List */}
      {releases.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-md mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
            <FileUp className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-100 mb-1">No Releases in this Channel</h3>
          <p className="text-sm text-slate-400 mb-6">
            Upload an APK manually or publish via GitLab CI/CD, GitHub Actions, or curl.
          </p>
          {canUpload && (
            <button
              onClick={() => setIsUploadOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Publish First Release</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {releases.map((rel) => (
            <div
              key={rel.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 transition-all shadow-sm"
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xl font-bold text-white font-mono">v{rel.version}</span>
                    <span className="text-xs bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded font-mono">
                      build #{rel.versionCode}
                    </span>
                    <ChannelBadge channel={rel.channel} />
                    <span className="text-xs text-slate-500">
                      • {formatBytes(rel.fileSize)}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      {rel.downloadCount} downloads
                    </span>
                  </div>

                  {/* Release Notes */}
                  {rel.releaseNotes && (
                    <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-300 font-sans leading-relaxed whitespace-pre-wrap">
                      {rel.releaseNotes}
                    </div>
                  )}

                  {/* Metadata line: SHA256, filename, uploader, date */}
                  <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span>SHA-256:</span>
                      <code className="text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800/60 truncate max-w-[200px] sm:max-w-xs">
                        {rel.sha256}
                      </code>
                      <button
                        onClick={() => handleCopySha(rel.sha256, rel.id)}
                        className="p-1 hover:text-slate-300 transition-colors"
                        title="Copy SHA-256 Checksum"
                      >
                        {copiedShaId === rel.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <span>• File: <span className="text-slate-400 font-mono">{rel.fileName}</span></span>
                    <span>• {formatDate(rel.createdAt)}</span>
                    {rel.uploadedBy && (
                      <span>• By <span className="text-slate-400">{rel.uploadedBy.name}</span></span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-start flex-shrink-0">
                  <button
                    onClick={() => handleDownload(rel)}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download APK</span>
                  </button>

                  <button
                    onClick={() => setQrRelease(rel)}
                    className="p-2 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
                    title="Scan QR Code to install directly on phone"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>

                  {canUpload && (
                    <button
                      onClick={() => handleDeleteRelease(rel)}
                      className="p-2 border border-rose-900/40 bg-rose-950/20 hover:bg-rose-900/40 text-rose-400 rounded-xl transition-colors"
                      title="Delete Release"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QR Code Modal */}
      {qrRelease && (
        <QrCodeModal
          isOpen={true}
          onClose={() => setQrRelease(null)}
          app={app}
          release={qrRelease}
        />
      )}

      {/* Upload Release Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsUploadOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white mb-1">Publish APK Release</h3>
            <p className="text-sm text-slate-400 mb-6">
              Upload a compiled Android APK binary for <strong className="text-slate-200">{app.name}</strong>.
            </p>

            {uploadError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* File picker */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  APK Binary File (.apk) *
                </label>
                <div className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-xl p-4 text-center cursor-pointer transition-colors bg-slate-950/50">
                  <input
                    type="file"
                    accept=".apk"
                    required
                    onChange={(e) => {
                      if (e.target.files?.[0]) setUploadFile(e.target.files[0]);
                    }}
                    className="hidden"
                    id="apk-file-upload"
                  />
                  <label htmlFor="apk-file-upload" className="cursor-pointer block">
                    {uploadFile ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-emerald-400 font-medium">
                        <FileCheck2 className="w-5 h-5" />
                        <span>{uploadFile.name} ({formatBytes(uploadFile.size)})</span>
                      </div>
                    ) : (
                      <div className="text-slate-400 text-xs">
                        <Upload className="w-6 h-6 mx-auto mb-2 text-slate-500" />
                        <span className="font-medium text-indigo-400">Click to browse</span> or drag and drop your .apk here
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Version & Version Code */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Version Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={uploadVersion}
                    onChange={(e) => setUploadVersion(e.target.value)}
                    placeholder="e.g. 1.2.0"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 text-sm font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Version Code *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={uploadVersionCode}
                    onChange={(e) => setUploadVersionCode(e.target.value)}
                    placeholder="e.g. 120"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 text-sm font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Release Channel */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Release Channel *
                </label>
                <select
                  value={uploadChannel}
                  onChange={(e) => setUploadChannel(e.target.value as ReleaseChannel)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="DEV">DEV — Internal development builds</option>
                  <option value="QA">QA — Quality assurance & testing builds</option>
                  <option value="STAGING">STAGING — Pre-production validation builds</option>
                  <option value="PRODUCTION">PRODUCTION — Stable public/field release</option>
                </select>
              </div>

              {/* Release Notes */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Release Notes / Changelog
                </label>
                <textarea
                  rows={3}
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="What's new in this build? Bug fixes, features, improvements..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="px-4 py-2 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadProgress}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl shadow-lg shadow-indigo-600/20 transition-colors flex items-center gap-2"
                >
                  {uploadProgress ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Hashing & Uploading...</span>
                    </>
                  ) : (
                    <span>Publish Release</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit App Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsEditOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white mb-4">Edit Application</h3>

            <form onSubmit={handleEditApp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Application Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
