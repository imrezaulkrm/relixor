import React from 'react';
import { ReleaseChannel } from '../types';

interface Props {
  channel: ReleaseChannel;
  size?: 'sm' | 'md';
}

export const ChannelBadge: React.FC<Props> = ({ channel, size = 'md' }) => {
  const styles: Record<ReleaseChannel, string> = {
    DEV: 'bg-slate-700 text-slate-300 border-slate-600',
    QA: 'bg-amber-950/60 text-amber-300 border-amber-800',
    STAGING: 'bg-blue-950/60 text-blue-300 border-blue-800',
    PRODUCTION: 'bg-emerald-950/60 text-emerald-300 border-emerald-800',
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${styles[channel] || styles.DEV} ${sizeClasses}`}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-70" />
      {channel}
    </span>
  );
};
