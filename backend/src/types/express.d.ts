import { Role, TokenPermission } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthApiToken {
  id: string;
  name: string;
  permission: TokenPermission;
  appId: string | null;
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      apiToken?: AuthApiToken;
      authMethod?: 'jwt' | 'api_token';
    }
  }
}
