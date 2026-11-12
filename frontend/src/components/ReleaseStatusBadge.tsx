import React from 'react';
import { ReleaseStatus } from '../types';

const STYLES: Record<ReleaseStatus, string> = {
  DRAFT: 'bg-slate-800 text-slate-300 border-slate-700',
  UPLOADED: 'bg-sky-950/60 text-sky-300 border-sky-800',
  PENDING_APPROVAL: 'bg-amber-950/60 text-amber-300 border-amber-800',
  APPROVED: 'bg-indigo-950/60 text-indigo-300 border-indigo-800',
  PUBLISHED: 'bg-emerald-950/60 text-emerald-300 border-emerald-800',
  REJECTED: 'bg-rose-950/60 text-rose-300 border-rose-800',
  DEPRECATED: 'bg-orange-950/60 text-orange-300 border-orange-800',
  ARCHIVED: 'bg-slate-900 text-slate-500 border-slate-800',
};

export const ReleaseStatusBadge: React.FC<{ status: ReleaseStatus }> = ({ status }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STYLES[status] || STYLES.DRAFT}`}
  >
    {status.replace(/_/g, ' ')}
  </span>
);
