export type Role = 'ADMIN' | 'DEVELOPER' | 'VIEWER';
export type ReleaseChannel = 'DEV' | 'QA' | 'STAGING' | 'PRODUCTION';
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

export interface AppItem {
  id: string;
  name: string;
  packageName: string;
  description?: string | null;
  iconUrl?: string | null;
  createdAt: string;
  updatedAt: string;
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
  releaseNotes?: string | null;
  fileName: string;
  storageKey: string;
  fileSize: number;
  sha256: string;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  uploadedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
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
