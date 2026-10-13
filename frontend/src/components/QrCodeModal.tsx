import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, Smartphone } from 'lucide-react';
import { Release, AppItem } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  app: AppItem;
  release: Release;
}

export const QrCodeModal: React.FC<Props> = ({ isOpen, onClose, app, release }) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const authToken = localStorage.getItem('relixor_auth_token') || '';
  // Provide download link with authentication token query param
  const downloadUrl = `${window.location.origin}/api/v1/apps/${app.id}/releases/${release.id}/download?token=${encodeURIComponent(authToken)}`;

  const handleCopy = () => {
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

        <div className="inline-block p-4 bg-white rounded-xl shadow-inner mb-6">
          <QRCodeSVG value={downloadUrl} size={200} level="M" />
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-left mb-6">
          <div className="truncate pr-2">
            <p className="text-xs text-slate-500 font-mono">Authenticated Download Link</p>
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
