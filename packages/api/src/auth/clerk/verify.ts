import { createHash } from 'node:crypto';
import { verifyToken } from '@clerk/backend';
import { logger } from '@librechat/data-schemas';
import { TokenVerificationError } from '@clerk/backend/errors';
import type { ClerkAuthConfigEnabled } from './types';
import { recordClerkTokenVerification } from '../../app/metrics';

export const CLERK_CLOCK_SKEW_MS: number = 5_000;
export const MAX_CLERK_TOKEN_LIFETIME_MS: number = 15 * 60 * 1_000;

export type ClerkAuthFailureCode =
  | 'CLERK_TOKEN_INVALID'
  | 'CLERK_LOGIN_FORBIDDEN'
  | 'CLERK_UPSTREAM_RATE_LIMITED'
  | 'CLERK_UNAVAILABLE';

export class ClerkAuthError extends Error {
  readonly code: ClerkAuthFailureCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ClerkAuthFailureCode,
    status: number,
    options: { retryAfterSeconds?: number } = {},
  ) {
    super('Clerk authentication failed');
    this.name = 'ClerkAuthError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export interface VerifiedClerkIdentity {
  clerkId: string;
  clerkSessionId: string;
  clerkTokenId: string;
  authorizedParty: string;
  tokenIssuedAt: Date;
  tokenExpiresAt: Date;
  email?: string;
  emailVerified?: true;
  name?: string;
  username?: string;
  avatarUrl?: string;
}

function invalidToken(): ClerkAuthError {
  return new ClerkAuthError('CLERK_TOKEN_INVALID', 401);
}

function requireNonBlankString(value: unknown): string {
  if (typeof value !== 'string') {
    throw invalidToken();
  }

  const normalized = value.trim();
  if (!normalized) {
    throw invalidToken();
  }

  return normalized;
}

function requireNumericDate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidToken();
  }

  return value;
}

function getOptionalNonBlankString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Clerk's shared `clerk.nolme.ai` instance is still on Session Token v1,
 * which has no `jti` claim (added in v2, see
 * https://clerk.com/changelog/2025-04-14-session-token-jwt-v2). Falling back
 * to a hash of the raw token preserves the same replay-defense property
 * (unique per token issuance, since Clerk mints a fresh token every ~60s)
 * without requiring an instance-wide v2 upgrade that would also affect every
 * other Cosmic product sharing that Clerk instance (tracked separately as
 * AF-rd7v). Prefers `jti` when present so this is a no-op once v2 is
 * eventually adopted.
 */
function deriveClerkTokenId(claims: { [claim: string]: unknown }, rawToken: string): string {
  const jti = getOptionalNonBlankString(claims.jti);
  if (jti) {
    return jti;
  }
  return createHash('sha256').update(rawToken).digest('hex');
}

function normalizeVerifiedClaims(
  claims: { [claim: string]: unknown },
  authorizedParties: readonly string[],
  rawToken: string,
): VerifiedClerkIdentity {
  const clerkId = requireNonBlankString(claims.sub);
  const clerkSessionId = requireNonBlankString(claims.sid);
  const clerkTokenId = deriveClerkTokenId(claims, rawToken);
  const authorizedParty = requireNonBlankString(claims.azp);
  requireNonBlankString(claims.iss);

  if (!authorizedParties.includes(authorizedParty)) {
    throw invalidToken();
  }
  if (claims.sts === 'pending') {
    throw invalidToken();
  }

  const issuedAtSeconds = requireNumericDate(claims.iat);
  const expiresAtSeconds = requireNumericDate(claims.exp);
  const lifetimeMs = (expiresAtSeconds - issuedAtSeconds) * 1_000;

  if (lifetimeMs <= 0 || lifetimeMs > MAX_CLERK_TOKEN_LIFETIME_MS) {
    throw invalidToken();
  }

  return {
    clerkId,
    clerkSessionId,
    clerkTokenId,
    authorizedParty,
    tokenIssuedAt: new Date(issuedAtSeconds * 1_000),
    tokenExpiresAt: new Date(expiresAtSeconds * 1_000),
  };
}

function getElapsedSeconds(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

export async function verifyClerkSessionToken(
  token: string,
  config: ClerkAuthConfigEnabled,
): Promise<VerifiedClerkIdentity> {
  const startedAt = process.hrtime.bigint();
  let outcome: 'success' | 'invalid' = 'invalid';
  let stage: 'clerk_verify' | 'claim_normalize' = 'clerk_verify';
  let verifiedClaims: { [claim: string]: unknown } | undefined;

  try {
    const claims = await verifyToken(token, {
      jwtKey: config.jwtKey,
      authorizedParties: [...config.authorizedParties],
      clockSkewInMs: CLERK_CLOCK_SKEW_MS,
    });
    verifiedClaims = claims;

    stage = 'claim_normalize';
    const identity = normalizeVerifiedClaims(claims, config.authorizedParties, token);
    outcome = 'success';
    return identity;
  } catch (error) {
    logger.warn('[verifyClerkSessionToken] rejected', {
      stage,
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : undefined,
      reason: error instanceof TokenVerificationError ? error.reason : undefined,
      authorizedParties: config.authorizedParties,
      claims:
        stage === 'claim_normalize' && verifiedClaims
          ? {
              sub: verifiedClaims.sub,
              sid: verifiedClaims.sid,
              jti: verifiedClaims.jti,
              azp: verifiedClaims.azp,
              iss: verifiedClaims.iss,
              sts: verifiedClaims.sts,
              iat: verifiedClaims.iat,
              exp: verifiedClaims.exp,
            }
          : undefined,
    });
    throw invalidToken();
  } finally {
    recordClerkTokenVerification(outcome, getElapsedSeconds(startedAt));
  }
}
