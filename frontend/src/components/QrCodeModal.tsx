import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, Smartphone, AlertCircle } from 'lucide-react';
import { Release, AppItem } from '../types';
import { apiRequest, ApiError } from '../api/client';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  app: AppItem;
  release: Release;
}

export const QrCodeModal: React.FC<Props> = ({ isOpen, onClose, app, release }) => {
  const [copied, setCopied] = React.useState(false);
  const [downloadUrl, setDownloadUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expiresIn, setExpiresIn] = React.useState(0);

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadTicket = async () => {
      setLoading(true);
      setError(null);
      setDownloadUrl(null);
      try {
        const ticket = await apiRequest<{ downloadPath: string; expiresInSeconds: number }>(
          `/apps/${app.id}/releases/${release.id}/download-ticket`
        );
        if (cancelled) return;
        setDownloadUrl(`${window.location.origin}${ticket.downloadPath}`);
        setExpiresIn(ticket.expiresInSeconds);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not create a secure download link for this release.'
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadTicket();
    return () => {
      cancelled = true;
    };
  }, [isOpen, app.id, release.id]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!downloadUrl) return;
    navigator.clipboard.writeText(downloadUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="inline-flex p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 mb-4">
          <Smartphone className="w-6 h-6" />
        </div>

        <h3 className="text-xl font-bold text-slate-100 mb-1">Direct Mobile Install</h3>
        <p className="text-sm text-slate-400 mb-6">
          Scan this QR code with your Android phone's camera to download{' '}
          <strong className="text-slate-200">{app.name}</strong> v{release.version}.
        </p>

        {loading ? (
          <div className="py-16 text-sm text-slate-400 flex items-center justify-center gap-3">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Creating secure download link...
          </div>
        ) : error ? (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-left">
            <div className="flex items-start gap-2 text-amber-300 text-xs leading-relaxed">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          </div>
        ) : downloadUrl ? (
          <>
            <div className="inline-block p-4 bg-white rounded-xl shadow-inner mb-4">
              <QRCodeSVG value={downloadUrl} size={200} level="M" />
            </div>
            <p className="text-[11px] text-amber-300 mb-4">
              Link expires in {Math.round(expiresIn / 60)} minutes and can be used once.
            </p>
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-left mb-6">
              <div className="truncate pr-2">
                <p className="text-xs text-slate-500 font-mono">Single-use download link</p>
                <p className="text-xs text-slate-300 font-mono truncate">{downloadUrl}</p>
              </div>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                title="Copy URL"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </>
        ) : null}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
