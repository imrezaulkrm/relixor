import crypto from 'crypto';

export interface GeneratedToken {
  plaintextToken: string;
  tokenPrefix: string;
  tokenHash: string;
}

export function generateApiToken(): GeneratedToken {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const plaintextToken = `relixor_live_${randomBytes}`;
  const tokenPrefix = plaintextToken.substring(0, 18) + '...';
  const tokenHash = hashApiToken(plaintextToken);

  return {
    plaintextToken,
    tokenPrefix,
    tokenHash,
  };
}

export function hashApiToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}
