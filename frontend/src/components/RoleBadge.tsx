import React from 'react';
import { Role } from '../types';

interface Props {
  role: Role;
}

export const RoleBadge: React.FC<Props> = ({ role }) => {
  const styles: Record<Role, string> = {
    ADMIN: 'bg-purple-950/60 text-purple-300 border-purple-800',
    DEVELOPER: 'bg-indigo-950/60 text-indigo-300 border-indigo-800',
    VIEWER: 'bg-slate-800 text-slate-300 border-slate-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-md border ${styles[role] || styles.VIEWER}`}
    >
      {role}
    </span>
  );
};
