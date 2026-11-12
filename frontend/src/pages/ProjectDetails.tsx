import React, { useState, useEffect } from 'react';
import { apiRequest, ApiError } from '../api/client';
import { Project, AppItem, ProjectMember, MembershipRole, User } from '../types';
import { useAuth } from '../context/AuthContext';
import { ChannelBadge } from '../components/ChannelBadge';
import { RoleBadge } from '../components/RoleBadge';
import { formatDate } from '../utils/format';
import {
  FolderKanban,
  Smartphone,
  Plus,
  ArrowLeft,
  ArrowRight,
  Box,
  Layers,
  Users as UsersIcon,
  X,
  AlertCircle,
  Search,
  Trash2,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';

interface Props {
  projectId: string;
  onBack: () => void;
  onSelectApp: (appId: string) => void;
}

export const ProjectDetails: React.FC<Props> = ({ projectId, onBack, onSelectApp }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [project, setProject] = useState<Project | null>(null);
  // A project-level VIEWER keeps read-only UI even when their global role is DEVELOPER.
  const canCreateApp = isAdmin || project?.effectiveRole === 'DEVELOPER';
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'apps' | 'members'>('apps');

  // Search
  const [search, setSearch] = useState('');

  // Members state
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Add Member Modal
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<MembershipRole>('DEVELOPER');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [submittingMember, setSubmittingMember] = useState(false);

  // Remove Member State
  const [removingMember, setRemovingMember] = useState<ProjectMember | null>(null);

  // Create App Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [appName, setAppName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [appDescription, setAppDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchProjectDetails = async () => {
    try {
      setLoading(true);
      const data = await apiRequest<Project>(`/projects/${projectId}`);
      setProject(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    if (!isAdmin) return;
    try {
      setLoadingMembers(true);
      const [membersData, usersData] = await Promise.all([
        apiRequest<ProjectMember[]>(`/projects/${projectId}/members`),
        apiRequest<User[]>('/users'),
      ]);
      setMembers(membersData);
      setAllUsers(usersData.filter((u) => u.isActive && u.role !== 'ADMIN'));
    } catch (err) {
      console.error('Failed to load project members', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    fetchProjectDetails();
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'members' && isAdmin) {
      fetchMembers();
    }
  }, [activeTab, projectId, isAdmin]);

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const created = await apiRequest<AppItem>(`/projects/${projectId}/apps`, {
        method: 'POST',
        body: JSON.stringify({
          name: appName,
          packageName,
          description: appDescription || undefined,
        }),
      });

      setIsCreateOpen(false);
      setAppName('');
      setPackageName('');
      setAppDescription('');
      fetchProjectDetails();
      onSelectApp(created.id);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('Failed to create application');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError(null);
    setSubmittingMember(true);

    try {
      await apiRequest(`/projects/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          userId: selectedUserId,
          role: selectedRole,
        }),
      });

      setIsAddMemberOpen(false);
      setSelectedUserId('');
      setSelectedRole('DEVELOPER');
      fetchMembers();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setMemberError(err.message);
      } else {
        setMemberError('Failed to assign member');
      }
    } finally {
      setSubmittingMember(false);
    }
  };

  const handleUpdateMemberRole = async (targetUserId: string, newRole: MembershipRole) => {
    try {
      await apiRequest(`/projects/${projectId}/members/${targetUserId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      fetchMembers();
    } catch (err) {
      console.error('Failed to update member role', err);
    }
  };

  const handleRemoveMember = async () => {
    if (!removingMember) return;
    try {
      await apiRequest(`/projects/${projectId}/members/${removingMember.userId}`, {
        method: 'DELETE',
      });
      setRemovingMember(null);
      fetchMembers();
    } catch (err) {
      console.error('Failed to remove member', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Loading project details...
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center max-w-md mx-auto">
        <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-100 mb-1">Project Not Found</h3>
        <p className="text-sm text-slate-400 mb-6">The requested project could not be found or was removed.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl"
        >
          Return to Projects
        </button>
      </div>
    );
  }

  const apps = project.apps || [];
  const filteredApps = apps.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.packageName.toLowerCase().includes(search.toLowerCase())
  );

  const filteredMembers = members.filter(
    (m) =>
      m.user.name.toLowerCase().includes(search.toLowerCase()) ||
      m.user.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation & Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Projects</span>
        </button>
      </div>

      {/* Project Banner Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <FolderKanban className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white tracking-tight">{project.name}</h1>
                {project.slug === 'default-project' && (
                  <span className="text-[10px] uppercase font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    Default Project
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="font-mono text-xs text-slate-400 bg-slate-800 px-2.5 py-0.5 rounded-md border border-slate-700">
                  {project.slug}
                </span>
                <span className="text-xs text-slate-500">Created {formatDate(project.createdAt)}</span>
              </div>
              <p className="text-sm text-slate-300 mt-3 max-w-2xl leading-relaxed">
                {project.description || 'No description provided for this project.'}
              </p>
            </div>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-4 shrink-0">
            {activeTab === 'apps' && canCreateApp && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Application</span>
              </button>
            )}

            {activeTab === 'members' && isAdmin && (
              <button
                onClick={() => setIsAddMemberOpen(true)}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
              >
                <UserCheck className="w-4 h-4" />
                <span>Assign Member</span>
              </button>
            )}

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                <Box className="w-3.5 h-3.5 text-indigo-400" />
                <strong className="text-slate-200">{project.appCount ?? apps.length}</strong> Apps
              </span>
              <span className="flex items-center gap-1.5 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <strong className="text-slate-200">{project.releaseCount ?? 0}</strong> Releases
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveTab('apps')}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'apps'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Applications ({apps.length})</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab('members')}
              className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'members'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <UsersIcon className="w-4 h-4" />
              <span>Project Members ({members.length})</span>
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative w-64 mb-2">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={activeTab === 'apps' ? 'Filter applications...' : 'Filter members...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Tab: Applications */}
      {activeTab === 'apps' && (
        apps.length === 0 ? (
          <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-12 text-center max-w-md mx-auto">
            <Smartphone className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-200 mb-1">No Applications in Project</h3>
            <p className="text-xs text-slate-400 mb-5">Add your first Android APK package to this project to start managing releases.</p>
            {canCreateApp && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all"
              >
                Add Application
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredApps.map((app) => (
              <div
                key={app.id}
                onClick={() => onSelectApp(app.id)}
                className="bg-slate-900/40 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 transition-all hover:shadow-xl hover:shadow-indigo-500/5 cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Smartphone className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-100 text-base group-hover:text-indigo-300 transition-colors">
                          {app.name}
                        </h3>
                        <p className="font-mono text-xs text-slate-400 truncate max-w-[180px]">
                          {app.packageName}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4 min-h-[32px]">
                    {app.description || 'No description provided.'}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <div>
                    {app.latestRelease ? (
                      <div className="flex items-center gap-2">
                        <ChannelBadge channel={app.latestRelease.channel} />
                        <span className="font-mono text-xs text-slate-300 font-medium">
                          v{app.latestRelease.version}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">No releases yet</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs font-semibold text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                    <span>Releases</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab: Project Members (Admin view) */}
      {activeTab === 'members' && isAdmin && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
          {loadingMembers ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading project members...</div>
          ) : members.length === 0 ? (
            <div className="p-12 text-center max-w-md mx-auto">
              <UsersIcon className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-200 mb-1">No Explicit Members</h3>
              <p className="text-xs text-slate-400 mb-4">
                Administrators retain platform-wide access automatically. Assign Developers or Viewers to grant them project-level access.
              </p>
              <button
                onClick={() => setIsAddMemberOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl"
              >
                Assign First Member
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">User</th>
                    <th className="px-6 py-3.5">Global Role</th>
                    <th className="px-6 py-3.5">Project Role</th>
                    <th className="px-6 py-3.5">Assigned Date</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-200">{member.user.name}</div>
                        <div className="font-mono text-[11px] text-slate-500">{member.user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <RoleBadge role={member.user.role} />
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={member.role}
                          onChange={(e) =>
                            handleUpdateMemberRole(member.userId, e.target.value as MembershipRole)
                          }
                          className="bg-slate-950 border border-slate-800 text-indigo-300 font-semibold text-xs px-2.5 py-1 rounded-lg focus:outline-none focus:border-indigo-500"
                        >
                          <option value="DEVELOPER">DEVELOPER (Write)</option>
                          <option value="VIEWER">VIEWER (Read-Only)</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        {formatDate(member.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setRemovingMember(member)}
                          className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                          title="Revoke Project Access"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Member Modal */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsAddMemberOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-lg">Assign Project Member</h3>
                <p className="text-xs text-slate-400">Project: {project.name}</p>
              </div>
            </div>

            {memberError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{memberError}</span>
              </div>
            )}

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Select User <span className="text-rose-400">*</span>
                </label>
                <select
                  required
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Choose active user --</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}) — Global: {u.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Project Membership Role <span className="text-rose-400">*</span>
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as MembershipRole)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="DEVELOPER">DEVELOPER (Write / Upload / Manage Releases)</option>
                  <option value="VIEWER">VIEWER (Read-Only / Download Artifacts)</option>
                </select>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400 leading-relaxed">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 inline mr-1" />
                Project members automatically gain base access to all applications inside this project unless overridden by a more restrictive direct application assignment.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)}
                  className="px-4 py-2.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingMember || !selectedUserId}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
                >
                  {submittingMember && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>Assign Access</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      {removingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-lg">Revoke Project Access</h3>
                <p className="text-xs text-slate-400">Remove project membership</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed mb-6">
              Are you sure you want to remove <strong className="text-white">{removingMember.user.name}</strong> ({removingMember.user.email}) from project <strong className="text-white">{project.name}</strong>?
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemovingMember(null)}
                className="px-4 py-2.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveMember}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-rose-600/20 transition-all"
              >
                Revoke Access
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Application Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-lg">Add Application</h3>
                <p className="text-xs text-slate-400">Attach to project: {project.name}</p>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateApp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Application Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Relixor POS Terminal"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Android Package Name <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">Unique ID</span>
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. com.relixor.pos"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value.trim())}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Application purpose, target devices, and release overview..."
                  value={appDescription}
                  onChange={(e) => setAppDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
                >
                  {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>Register Application</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
