import { v5 as uuidv5 } from 'uuid';

/**
 * Fixed namespace for UUID v5 — must never change or the same email maps to a different id.
 * Policies should compare user_id to this value as text (same as auth.uid()::text).
 */
export const RLS_USER_ID_NAMESPACE = '842c4e8a-8f2d-4b91-9c14-0e7f8a9b1c2d';

export function stableUserIdFromEmail(email: string): string {
  return uuidv5(email.toLowerCase().trim(), RLS_USER_ID_NAMESPACE);
}

/** `iss` claim on Supabase Auth access tokens (used by jose + PostgREST). */
export function supabaseAuthIssuer(supabaseUrl: string): string {
  const u = new URL(supabaseUrl);
  return `https://${u.hostname}/auth/v1`;
}

/** ES256 signing keys for verifying access tokens (JWT Signing Keys / JWKS). */
export function supabaseJwksUrl(supabaseUrl: string): string {
  return `${supabaseAuthIssuer(supabaseUrl)}/.well-known/jwks.json`;
}
