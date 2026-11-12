import React, { useEffect, useState } from 'react';
import { apiRequest, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { RoleBadge } from '../components/RoleBadge';
import { formatDate } from '../utils/format';
import { User } from '../types';
import {
  AlertCircle,
  CheckCircle2,
  FolderKanban,
  KeyRound,
  Laptop,
  LogIn,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';

interface ProfileData {
  user: User & { updatedAt?: string };
  projects: Array<{ projectId: string; project: { id: string; name: string; slug: string }; role: string; assignedAt: string }>;
  apps: Array<{ appId: string; app: { id: string; name: string; packageName: string }; role: string; assignedAt: string }>;
}

interface SessionItem {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
  active: boolean;
}

interface LoginEventItem {
  id: string;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  ipAddress: string | null;
  createdAt: string;
}

const Section: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode; subtitle?: string }> = ({
  title,
  subtitle,
  icon: Icon,
  children,
}) => (
  <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <h2 className="text-base font-bold text-slate-100">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {children}
  </section>
);

export const Profile: React.FC = () => {
  const { user, token, login } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activity, setActivity] = useState<{ loginEvents: LoginEventItem[]; auditLogs: AuditItem[] }>({
    loginEvents: [],
    auditLogs: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [profileData, sessionData, activityData] = await Promise.all([
        apiRequest<ProfileData>('/profile'),
        apiRequest<SessionItem[]>('/profile/sessions'),
        apiRequest<{ loginEvents: LoginEventItem[]; auditLogs: AuditItem[] }>('/profile/activity'),
      ]);
      setProfile(profileData);
      setName(profileData.user.name);
      setSessions(sessionData);
      setActivity(activityData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load account details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const updated = await apiRequest<User>('/profile', {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      setProfile((prev) => (prev ? { ...prev, user: { ...prev.user, ...updated } } : prev));
      if (user && token) login(token, { ...user, name: updated.name });
      setProfileMessage('Profile updated.');
    } catch (err) {
      setProfileMessage(err instanceof ApiError ? err.message : 'Could not update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    setPasswordSaving(true);
    try {
      const result = await apiRequest<{ token: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (user && result?.token) login(result.token, user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Password changed. Other sessions were signed out.');
      const refreshed = await apiRequest<SessionItem[]>('/profile/sessions');
      setSessions(refreshed);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Could not change password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const revokeSession = async (session: SessionItem) => {
    if (!confirm(session.current ? 'Revoke your current session? You will be signed out.' : 'Revoke this session?')) return;
    try {
      await apiRequest(`/profile/sessions/${session.id}`, { method: 'DELETE' });
      if (session.current) {
        window.location.href = '/login';
        return;
      }
      setSessions((prev) => prev.map((item) => (item.id === session.id ? { ...item, active: false, revokedAt: new Date().toISOString() } : item)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not revoke session.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
        Loading your account...
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-3" />
        <p className="text-sm text-slate-300">{error || 'Account unavailable.'}</p>
        <button onClick={load} className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-xl">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">My Profile</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your identity, password and active sessions.</p>
        </div>
        <div className="flex items-center gap-3">
          <RoleBadge role={profile.user.role} />
          <span className="text-xs text-slate-400">Joined {formatDate(profile.user.createdAt)}</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Account details" icon={ShieldCheck} subtitle="Role and email are managed by an administrator.">
          <form onSubmit={handleProfileSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Full name
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Email address
              </label>
              <input
                value={profile.user.email}
                readOnly
                className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-400 text-sm"
              />
            </div>
            {profileMessage && (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {profileMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={profileSaving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium rounded-xl flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> {profileSaving ? 'Saving...' : 'Save profile'}
            </button>
          </form>
        </Section>

        <Section title="Change password" icon={KeyRound} subtitle="Current password verification is required.">
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Current password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  New password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            {passwordError && (
              <p className="text-xs text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> {passwordError}
              </p>
            )}
            {passwordMessage && (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {passwordMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={passwordSaving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium rounded-xl"
            >
              {passwordSaving ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </Section>
      </div>

      <Section title="Active sessions" icon={Laptop} subtitle="Revoking a session invalidates its token immediately.">
        {sessions.length === 0 ? (
          <p className="text-xs text-slate-500">No sessions recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">Device</th>
                  <th className="py-3 px-3">Signed in</th>
                  <th className="py-3 px-3">Last seen</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="py-3 px-3 text-slate-300 max-w-[280px] truncate" title={session.userAgent || 'Unknown device'}>
                      {session.userAgent || 'Unknown device'}
                      <div className="text-[11px] font-mono text-slate-500">{session.ipAddress || 'no IP'}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-400">{formatDate(session.createdAt)}</td>
                    <td className="py-3 px-3 text-slate-400">{formatDate(session.lastSeenAt)}</td>
                    <td className="py-3 px-3">
                      {session.active ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-950/60 text-emerald-300 border border-emerald-800">
                          {session.current ? 'Current' : 'Active'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-800 text-slate-400 border border-slate-700">
                          Revoked
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {session.active && (
                        <button
                          onClick={() => revokeSession(session)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg"
                          title="Revoke session"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Resource assignments" icon={FolderKanban} subtitle="Projects and applications you can access.">
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Projects</h3>
              {profile.projects.length === 0 ? (
                <p className="text-xs text-slate-500">No direct project assignments.</p>
              ) : (
                <div className="space-y-2">
                  {profile.projects.map((item) => (
                    <div key={item.projectId} className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2">
                      <span className="text-sm text-slate-200">{item.project.name}</span>
                      <RoleBadge role={item.role as any} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" /> Applications
              </h3>
              {profile.apps.length === 0 ? (
                <p className="text-xs text-slate-500">No direct application assignments.</p>
              ) : (
                <div className="space-y-2">
                  {profile.apps.map((item) => (
                    <div key={item.appId} className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2">
                      <div>
                        <div className="text-sm text-slate-200">{item.app.name}</div>
                        <div className="text-[11px] font-mono text-slate-500">{item.app.packageName}</div>
                      </div>
                      <RoleBadge role={item.role as any} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section title="Recent account activity" icon={LogIn} subtitle="Login history and recent account actions.">
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {activity.loginEvents.length === 0 && activity.auditLogs.length === 0 ? (
              <p className="text-xs text-slate-500">No activity recorded yet.</p>
            ) : (
              <>
                {activity.loginEvents.slice(0, 10).map((event) => (
                  <div key={event.id} className="flex items-start justify-between gap-3 text-xs border-b border-slate-800/60 pb-2">
                    <div>
                      <div className="text-slate-300 font-medium">
                        {event.action === 'LOGIN' ? 'Signed in' : event.action === 'LOGOUT' ? 'Signed out' : 'Failed sign-in'}
                      </div>
                      <div className="text-slate-500 font-mono">{event.ipAddress || 'unknown IP'}</div>
                    </div>
                    <span className="text-slate-500 whitespace-nowrap">{formatDate(event.createdAt)}</span>
                  </div>
                ))}
                {activity.auditLogs.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between gap-3 text-xs border-b border-slate-800/60 pb-2">
                    <div>
                      <div className="text-slate-300 font-medium">{entry.action.replace(/_/g, ' ')}</div>
                      <div className="text-slate-500 font-mono">{entry.entityType}</div>
                    </div>
                    <span className="text-slate-500 whitespace-nowrap">{formatDate(entry.createdAt)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
};
