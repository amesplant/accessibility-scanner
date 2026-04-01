import { createClient, type Session } from '@supabase/supabase-js';
import * as jose from 'jose';
import { supabaseAuthIssuer, supabaseJwksUrl } from './rlsUser.js';

export interface StoredSupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
}

export interface SessionAuthProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

const jwksByProject = new Map<string, ReturnType<typeof jose.createRemoteJWKSet>>();

function getRemoteJwks(supabaseUrl: string) {
  let set = jwksByProject.get(supabaseUrl);
  if (!set) {
    set = jose.createRemoteJWKSet(new URL(supabaseJwksUrl(supabaseUrl)));
    jwksByProject.set(supabaseUrl, set);
  }
  return set;
}

export function parseStoredSession(raw: string): StoredSupabaseSession | null {
  try {
    const o = JSON.parse(raw) as StoredSupabaseSession;
    if (typeof o.access_token === 'string' && typeof o.refresh_token === 'string') return o;
  } catch {
    /* legacy JWT cookie */
  }
  return null;
}

export function profileFromJwtPayload(payload: jose.JWTPayload): SessionAuthProfile {
  const meta = (payload.user_metadata ?? {}) as { name?: string; picture?: string };
  return {
    id: String(payload.sub),
    email: String(payload.email ?? ''),
    name: String(meta.name ?? ''),
    picture: meta.picture,
  };
}

export function shouldRefreshAccessToken(expiresAt?: number, skewSec = 120): boolean {
  if (expiresAt == null || !Number.isFinite(expiresAt)) return true;
  const now = Math.floor(Date.now() / 1000);
  return expiresAt <= now + skewSec;
}

export async function verifySupabaseAccessToken(
  supabaseUrl: string,
  accessToken: string
): Promise<jose.JWTPayload> {
  const JWKS = getRemoteJwks(supabaseUrl);
  const issuer = supabaseAuthIssuer(supabaseUrl);
  const opts = { issuer, audience: 'authenticated', clockTolerance: 60 };
  try {
    const { payload } = await jose.jwtVerify(accessToken, JWKS, opts);
    return payload;
  } catch {
    const { payload } = await jose.jwtVerify(accessToken, JWKS, {
      issuer,
      clockTolerance: 60,
    });
    return payload;
  }
}

export async function refreshSupabaseSession(
  supabaseUrl: string,
  publishableKey: string,
  refreshToken: string
): Promise<Pick<Session, 'access_token' | 'refresh_token' | 'expires_in' | 'expires_at'>> {
  const base = supabaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${t}`);
  }
  return (await res.json()) as Pick<Session, 'access_token' | 'refresh_token' | 'expires_in' | 'expires_at'>;
}

/**
 * After SSO, create a real Supabase Auth session (ES256 access token) via admin magic-link + verify.
 * `user_id` in your tables must match `auth.users.id` / JWT `sub`.
 */
export async function issueSupabaseSessionFromSsoProfile(opts: {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  email: string;
  name: string;
  picture?: string;
}): Promise<Session> {
  const admin = createClient(opts.supabaseUrl, opts.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: opts.email,
    options: {
      data: { name: opts.name, ...(opts.picture ? { picture: opts.picture } : {}) },
    },
  });
  if (linkErr) throw linkErr;

  const anon = createClient(opts.supabaseUrl, opts.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: authData, error: verifyErr } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'email',
  });
  if (verifyErr) throw verifyErr;
  if (!authData.session) throw new Error('Supabase verifyOtp returned no session');
  return authData.session;
}
