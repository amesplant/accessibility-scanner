import { Router, Request, Response, NextFunction } from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import memoryStoreFactory from 'memorystore';

const MemoryStore = memoryStoreFactory(session);

// Load .env from the project root (Node 22+ built-in) — must run before any env var reads
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // .env not found — rely on environment variables set externally
}

const ALLOWED_DOMAINS = ['10up.com', 'fueled.com'];

// ---------------------------------------------------------------------------
// Extend Express types
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      picture: string;
      accessToken: string;
      refreshToken?: string;
    }
  }
}

// ---------------------------------------------------------------------------
// Session middleware
// ---------------------------------------------------------------------------

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error('SESSION_SECRET environment variable is required');
}

export const sessionMiddleware = session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({ checkPeriod: 86_400_000 }), // prune expired entries every 24h
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
  },
});

// ---------------------------------------------------------------------------
// Passport config
// ---------------------------------------------------------------------------

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientID || !clientSecret) {
  throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required');
}

passport.use(
  new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL: process.env.CALLBACK_URL ?? 'http://localhost:5173/auth/google/callback',
    },
    (accessToken, refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value ?? '';
      const domain = email.split('@')[1];

      if (!ALLOWED_DOMAINS.includes(domain)) {
        return done(null, false);
      }

      const user: Express.User = {
        id: profile.id,
        email,
        name: profile.displayName,
        picture: profile.photos?.[0]?.value ?? '',
        accessToken,
        refreshToken: refreshToken ?? undefined,
      };

      return done(null, user);
    },
  ),
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user: Express.User, done) => {
  done(null, user);
});

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------

export const authRouter = Router();

authRouter.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

authRouter.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (_req: Request, res: Response) => {
    res.redirect('/');
  },
);

authRouter.post('/auth/logout', (req: Request, res: Response, next: NextFunction) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.status(200).json({ ok: true });
    });
  });
});

authRouter.get('/auth/me', (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json(req.user);
});
