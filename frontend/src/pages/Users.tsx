import React, { useState, useEffect } from 'react';
import { apiRequest, ApiError } from '../api/client';
import { User, Role, UserAccessOverview } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/format';
import { RoleBadge } from '../components/RoleBadge';
import {
  Plus,
  Trash2,
  Edit,
  X,
  AlertCircle,
  UserCheck,
  UserX,
  ShieldCheck,
  FolderKanban,
  Smartphone,
  Laptop,
  KeyRound,
  Copy,
  Check,
} from 'lucide-react';

export const Users: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Create User Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('DEVELOPER');
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit User Modal
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<Role>('DEVELOPER');
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState('');

  // Session / Account Security Modal
  const [securityUser, setSecurityUser] = useState<User | null>(null);
  const [userSessions, setUserSessions] = useState<Array<any>>([]);
  const [userActivity, setUserActivity] = useState<Array<any>>([]);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [copiedReset, setCopiedReset] = useState(false);

  const openSecurity = async (target: User) => {
    setSecurityUser(target);
    setResetToken(null);
    setSecurityLoading(true);
    try {
      const [sessions, activity] = await Promise.all([
        apiRequest<Array<any>>(`/users/${target.id}/sessions`),
        apiRequest<{ loginEvents: Array<any> }>(`/users/${target.id}/activity`),
      ]);
      setUserSessions(sessions);
      setUserActivity(activity.loginEvents.slice(0, 8));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setSecurityLoading(false);
    }
  };

  const revokeAllSessions = async () => {
    if (!securityUser || !confirm(`Revoke every active session for ${securityUser.email}?`)) return;
    try {
      await apiRequest(`/users/${securityUser.id}/sessions`, { method: 'DELETE' });
      setUserSessions([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke sessions');
    }
  };

  const issueReset = async () => {
    if (!securityUser) return;
    try {
      const result = await apiRequest<{ resetToken: string }>(`/users/${securityUser.id}/password-reset`, {
        method: 'POST',
      });
      setResetToken(result.resetToken);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to issue reset token');
    }
  };

  // Access Overview Modal
  const [accessUser, setAccessUser] = useState<User | null>(null);
  const [accessData, setAccessData] = useState<UserAccessOverview | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const openAccessOverview = async (target: User) => {
    setAccessUser(target);
    setAccessData(null);
    setAccessError(null);
    setAccessLoading(true);
    try {
      const data = await apiRequest<UserAccessOverview>(`/users/${target.id}/access`);
      setAccessData(data);
    } catch (err) {
      setAccessError(err instanceof ApiError ? err.message : 'Failed to load user access overview');
    } finally {
      setAccessLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await apiRequest<User[]>('/users');
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === 'ADMIN') {
      fetchUsers();
    }
  }, [currentUser]);

  if (currentUser?.role !== 'ADMIN') {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-md mx-auto">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-100 mb-1">Access Denied</h3>
        <p className="text-xs text-slate-400">User Management requires Administrator privileges.</p>
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setSubmitting(true);

    try {
      await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify({ email, name, password, role }),
      });

      setIsCreateOpen(false);
      setName('');
      setEmail('');
      setPassword('');
      setRole('DEVELOPER');
      fetchUsers();
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to create user account');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      await apiRequest(`/users/${editingUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          role: editRole,
          isActive: editActive,
          password: editPassword || undefined,
        }),
      });

      setEditingUser(null);
      setEditPassword('');
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleDeleteUser = async (userToDelete: User) => {
    if (userToDelete.id === currentUser?.id) {
      alert('You cannot delete your own account.');
      return;
    }

    if (!confirm(`Are you sure you want to delete user '${userToDelete.email}'?`)) {
      return;
    }

    try {
      await apiRequest(`/users/${userToDelete.id}`, { method: 'DELETE' });
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">User Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure system accounts and manage role-based permissions (Admin, Developer, Viewer).
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add User Account</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
          Loading user directory...
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">User</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Created Date</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-100">{u.name}</div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">{u.email}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="py-3.5 px-4">
                      {u.isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800">
                          <UserCheck className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          <UserX className="w-3 h-3" /> Deactivated
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">{formatDate(u.createdAt)}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openAccessOverview(u)}
                          className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition-colors"
                          title="View Resource Access"
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => openSecurity(u)}
                          className="p-1.5 text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Sessions & Password Reset"
                        >
                          <Laptop className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setEditingUser(u);
                            setEditRole(u.role);
                            setEditActive(u.isActive);
                            setEditPassword('');
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Edit User"
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        {u.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white mb-1">Add User Account</h3>
            <p className="text-sm text-slate-400 mb-6">Create credentials for a team member.</p>

            {createError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@company.com"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Initial Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Role Permission *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="DEVELOPER">DEVELOPER — Can upload & manage apps & releases</option>
                  <option value="VIEWER">VIEWER — Can browse & download APKs only</option>
                  <option value="ADMIN">ADMIN — Full system administrator access</option>
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
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Access Overview Modal */}
      {accessUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setAccessUser(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white mb-1">Resource Access Overview</h3>
            <p className="text-xs text-slate-400 mb-5 font-mono">{accessUser.name} · {accessUser.email}</p>

            {accessLoading ? (
              <div className="py-12 text-center text-sm text-slate-400">Loading access details...</div>
            ) : accessError ? (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{accessError}</span>
              </div>
            ) : accessData ? (
              <div className="space-y-6">
                {accessData.isGlobalAdmin && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-300 text-xs">
                    Global ADMIN — full access to every project and application without membership records.
                  </div>
                )}

                <div>
                  <h4 className="flex items-center gap-2 text-sm font-bold text-slate-100 mb-3">
                    <FolderKanban className="w-4 h-4 text-indigo-400" />
                    Project Assignments ({accessData.projects.length})
                  </h4>
                  {accessData.projects.length === 0 ? (
                    <p className="text-xs text-slate-500">No direct project memberships.</p>
                  ) : (
                    <div className="space-y-2">
                      {accessData.projects.map((p) => (
                        <div key={p.projectId} className="flex items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5">
                          <div>
                            <div className="text-sm text-slate-100 font-medium">{p.projectName}</div>
                            <div className="text-[11px] font-mono text-slate-500">{p.projectSlug} · assigned {formatDate(p.assignedAt)}</div>
                          </div>
                          <RoleBadge role={p.role} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="flex items-center gap-2 text-sm font-bold text-slate-100 mb-3">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    Effective Application Access ({accessData.apps.length})
                  </h4>
                  {accessData.apps.length === 0 ? (
                    <p className="text-xs text-slate-500">No application access through memberships.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
                          <tr>
                            <th className="py-2.5 px-3">Application</th>
                            <th className="py-2.5 px-3">Project</th>
                            <th className="py-2.5 px-3">Direct</th>
                            <th className="py-2.5 px-3">Project</th>
                            <th className="py-2.5 px-3">Effective</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {accessData.apps.map((a) => (
                            <tr key={a.appId}>
                              <td className="py-2.5 px-3">
                                <div className="text-slate-100 font-medium">{a.appName}</div>
                                <div className="text-[11px] font-mono text-slate-500">{a.packageName}</div>
                              </td>
                              <td className="py-2.5 px-3 text-slate-400">{a.projectName}</td>
                              <td className="py-2.5 px-3 text-slate-400">{a.directRole || '—'}</td>
                              <td className="py-2.5 px-3 text-slate-400">{a.projectRole || '—'}</td>
                              <td className="py-2.5 px-3"><RoleBadge role={a.effectiveRole} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-800 pt-3">
                  A direct app role always overrides the project role. Without a direct app assignment, the project role is inherited.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Session & Account Security Modal */}
      {securityUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSecurityUser(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-1">Sessions & Account Security</h3>
            <p className="text-xs text-slate-400 mb-5 font-mono">{securityUser.email}</p>

            {securityLoading ? (
              <p className="text-sm text-slate-400 py-8 text-center">Loading sessions...</p>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <Laptop className="w-4 h-4 text-sky-400" /> Active sessions
                    </h4>
                    <button
                      onClick={revokeAllSessions}
                      disabled={userSessions.filter((session) => session.active).length === 0}
                      className="text-xs px-3 py-1.5 bg-rose-600/80 hover:bg-rose-600 disabled:opacity-40 text-white rounded-lg"
                    >
                      Revoke all
                    </button>
                  </div>
                  {userSessions.length === 0 ? (
                    <p className="text-xs text-slate-500">No sessions recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {userSessions.slice(0, 8).map((session) => (
                        <div key={session.id} className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs">
                          <div className="min-w-0">
                            <div className="text-slate-300 truncate">{session.userAgent || 'Unknown device'}</div>
                            <div className="text-[10px] font-mono text-slate-500">{session.ipAddress || 'no IP'} · {formatDate(session.createdAt)}</div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] border ${session.active ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                            {session.active ? 'Active' : 'Revoked'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-200 mb-2">Recent login events</h4>
                  {userActivity.length === 0 ? (
                    <p className="text-xs text-slate-500">No login events.</p>
                  ) : (
                    <div className="space-y-1">
                      {userActivity.map((event) => (
                        <div key={event.id} className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/60 py-1.5">
                          <span>{event.action.replace(/_/g, ' ')}</span>
                          <span className="text-slate-500">{formatDate(event.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <h4 className="text-sm font-bold text-slate-200 mb-1 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-400" /> Password reset token
                  </h4>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Single-use, expires in 60 minutes, hashed at rest. Share it securely; it is shown once.
                  </p>
                  {resetToken ? (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[10px] font-mono text-emerald-400 break-all bg-slate-950 border border-slate-800 rounded-lg p-2">
                        {resetToken}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(resetToken);
                          setCopiedReset(true);
                          setTimeout(() => setCopiedReset(false), 2000);
                        }}
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300"
                      >
                        {copiedReset ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  ) : (
                    <button onClick={issueReset} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-lg">
                      Issue reset token
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setEditingUser(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white mb-1">Edit User</h3>
            <p className="text-xs text-slate-400 mb-6 font-mono">{editingUser.email}</p>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Role
                </label>
                <select
                  value={editRole}
                  disabled={editingUser.id === currentUser?.id}
                  onChange={(e) => setEditRole(e.target.value as Role)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="DEVELOPER">DEVELOPER</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
                {editingUser.id === currentUser?.id && (
                  <p className="text-[11px] text-amber-400 mt-1">You cannot change your own role.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Account Status
                </label>
                <select
                  value={editActive ? 'true' : 'false'}
                  disabled={editingUser.id === currentUser?.id}
                  onChange={(e) => setEditActive(e.target.value === 'true')}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="true">Active</option>
                  <option value="false">Deactivated</option>
                </select>
                {editingUser.id === currentUser?.id && (
                  <p className="text-[11px] text-amber-400 mt-1">You cannot deactivate your own account.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Reset Password (optional)
                </label>
                <input
                  type="password"
                  minLength={8}
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave empty to keep current password"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
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
