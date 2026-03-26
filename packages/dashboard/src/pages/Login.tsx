import { Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

export function Login() {
  const location = useLocation();
  const redirectAfterLogin = new URLSearchParams(location.search).get('redirect') || '/';
  const { user, loading, error, login } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-sm text-zinc-500">Checking authentication status...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground mb-3">Sign in to Fueled Access</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Use Fueled SSO to sign in and continue to the vulnerability scan dashboard.
        </p>

        {error && <p className="mb-4 text-xs text-rose-400">{error}</p>}

        <Button onClick={() => login(redirectAfterLogin)} variant="default" className="w-full">
          Sign in with Fueled SSO
        </Button>

        <p className="mt-6 text-xs text-zinc-500">If you’re already signed in with Fueled, this will immediately redirect you.</p>
      </div>
    </main>
  );
}
