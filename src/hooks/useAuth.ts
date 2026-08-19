import { useCallback, useEffect, useState } from 'react';
import { apiCall, BackendError } from '@/lib/backend/client';

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /**
   * Whether a server tier exists at all. False keeps the app local-only, the
   * same graceful degradation Supabase-unset used to give us.
   */
  backendAvailable: boolean;
  /** Re-read the session — call after signing in or out. */
  refresh: () => Promise<void>;
}

interface MeResponse {
  user?: AuthUser;
  error?: string;
}

/**
 * Tracks the session by asking the server, replacing Supabase's
 * `onAuthStateChange`. There is no client-side token to observe any more — the
 * session cookie is httpOnly — so `/api/auth/me` is the single source of truth.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendAvailable, setBackendAvailable] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { status, body } = await apiCall<MeResponse>('/api/auth/me');
      if (status === 200 && body.user) {
        setUser(body.user);
        setBackendAvailable(true);
      } else if (status === 503) {
        // A server tier is deployed but has no database behind it.
        setUser(null);
        setBackendAvailable(false);
      } else {
        // 401 — signed out. Perfectly normal, not an error.
        setUser(null);
        setBackendAvailable(true);
      }
    } catch (err) {
      setUser(null);
      // Being offline says nothing about whether a backend exists, so only a
      // missing `/api` tier (HTML where JSON belongs) hides the account UI.
      if (err instanceof BackendError && err.code === 'backend_unavailable') {
        setBackendAvailable(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { user, loading, backendAvailable, refresh };
}
