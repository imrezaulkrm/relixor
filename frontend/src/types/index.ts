export type Role = 'ADMIN' | 'DEVELOPER' | 'VIEWER';
export type MembershipRole = 'DEVELOPER' | 'VIEWER';
export type ReleaseChannel = 'DEV' | 'QA' | 'STAGING' | 'BETA' | 'PRODUCTION';
export type ReleaseStatus =
  | 'DRAFT'
  | 'UPLOADED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'DEPRECATED'
  | 'ARCHIVED';
export type TokenPermission = 'READ' | 'WRITE' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  user: User;
  role: MembershipRole;
  createdAt: string;
  updatedAt?: string;
  createdBy?: { id: string; name: string } | null;
}

export interface AppMember {
  id: string;
  appId: string;
  userId: string;
  user: User;
  role: MembershipRole;
  createdAt: string;
  updatedAt?: string;
  createdBy?: { id: string; name: string } | null;
}

export interface UserAccessOverview {
  user: User;
  isGlobalAdmin: boolean;
  projects: Array<{
    projectId: string;
    projectName: string;
    projectSlug: string;
    role: MembershipRole;
    assignedAt: string;
    assignedBy?: { id: string; name: string } | null;
  }>;
  apps: Array<{
    appId: string;
    appName: string;
    packageName: string;
    projectId: string;
    projectName: string;
    directRole?: MembershipRole | null;
    projectRole?: MembershipRole | null;
    effectiveRole: MembershipRole;
    assignedAt: string;
  }>;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  iconUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
  appCount?: number;
  releaseCount?: number;
  effectiveRole?: 'ADMIN' | MembershipRole | null;
  apps?: AppItem[];
}

export interface AppItem {
  id: string;
  projectId?: string;
  project?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  name: string;
  packageName: string;
  description?: string | null;
  iconUrl?: string | null;
  isPublic?: boolean;
  publicSlug?: string | null;
  createdAt: string;
  updatedAt: string;
  effectiveRole?: 'ADMIN' | MembershipRole | null;
  releaseCount?: number;
  latestRelease?: {
    id: string;
    version: string;
    versionCode: number;
    channel: ReleaseChannel;
    fileSize: number;
    createdAt: string;
  } | null;
}

export interface Release {
  id: string;
  appId: string;
  version: string;
  versionCode: number;
  channel: ReleaseChannel;
  status: ReleaseStatus;
  title?: string | null;
  description?: string | null;
  releaseNotes?: string | null;
  fileName: string;
  storageKey: string;
  fileSize: number;
  sha256: string;
  downloadCount: number;
  isMandatory: boolean;
  minSupportedVersionCode?: number | null;
  isPinned: boolean;
  gitCommitSha?: string | null;
  gitBranch?: string | null;
  gitlabPipelineId?: string | null;
  gitlabPipelineUrl?: string | null;
  buildTimestamp?: string | null;
  approvedAt?: string | null;
  publishedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  uploadedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  approvedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  app?: AppItem;
  statusHistory?: Array<{
    id: string;
    fromStatus?: ReleaseStatus | null;
    toStatus: ReleaseStatus;
    reason?: string | null;
    createdAt: string;
    changedBy?: { id: string; name: string } | null;
  }>;
}

export interface ApiTokenItem {
  id: string;
  name: string;
  tokenPrefix: string;
  permission: TokenPermission;
  appId?: string | null;
  app?: { id: string; name: string; packageName: string } | null;
  user?: { id: string; name: string; email: string } | null;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revoked: boolean;
  createdAt: string;
  plaintextToken?: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
  app?: { id: string; name: string } | null;
}

export interface DashboardStats {
  totalApps: number;
  totalReleases: number;
  totalDownloads: number;
  storageBytes: number;
  channelCounts: Record<ReleaseChannel, number>;
  recentReleases: Array<Release & { app: { id: string; name: string; packageName: string } }>;
  recentActivity: AuditLogItem[];
}
