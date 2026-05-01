import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, tokens } from "../api/client";

export type AuthUser = {
  user_id: string;
  email: string;
  name: string;
  plan_tier: string;
  trial_active: boolean;
  trial_ends_at: string | null;
};

export type LinkedInStatus = {
  connected: boolean;
  sync_status?: string;
  is_demo?: boolean;
};

export type MeResponse = {
  user: AuthUser;
  onboarding: { questionnaire_completed: boolean };
  linkedin: LinkedInStatus;
};

type AuthContextValue = {
  user: AuthUser | null;
  onboardingComplete: boolean;
  linkedin: LinkedInStatus;
  loading: boolean;
  signup: (input: { email: string; name: string; password: string }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [linkedin, setLinkedIn] = useState<LinkedInStatus>({ connected: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokens.access()) {
      setUser(null);
      setOnboardingComplete(false);
      setLinkedIn({ connected: false });
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<MeResponse>("/auth/me");
      setUser(me.user);
      setOnboardingComplete(me.onboarding.questionnaire_completed);
      setLinkedIn(me.linkedin);
    } catch {
      tokens.clear();
      setUser(null);
      setOnboardingComplete(false);
      setLinkedIn({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signup = useCallback(
    async (input: { email: string; name: string; password: string }) => {
      const res = await api.unauth.post<{
        user: AuthUser;
        access_token: string;
        refresh_token: string;
      }>("/auth/signup", input);
      tokens.set(res.access_token, res.refresh_token);
      setUser(res.user);
      setOnboardingComplete(false);
      setLinkedIn({ connected: false });
    },
    [],
  );

  const login = useCallback(async (input: { email: string; password: string }) => {
    const res = await api.unauth.post<{
      user: AuthUser;
      access_token: string;
      refresh_token: string;
    }>("/auth/login", input);
    tokens.set(res.access_token, res.refresh_token);
    setUser(res.user);
    await refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
    setOnboardingComplete(false);
    setLinkedIn({ connected: false });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, onboardingComplete, linkedin, loading, signup, login, logout, refresh }),
    [user, onboardingComplete, linkedin, loading, signup, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
