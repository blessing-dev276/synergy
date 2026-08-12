import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";

// Supabase equivalent of the marketing site's useNetlifyIdentity.js — same
// `ready` flag convention. Unlike Firebase, role is read live from the
// `profiles` row on every auth-state change rather than cached in a JWT
// claim, so there's no token-refresh race to work around after signup.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);

  const loadProfile = useCallback(async (uid) => {
    if (!uid) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
    setProfile(data ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadProfile(data.session?.user?.id);
      if (!cancelled) setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      await loadProfile(nextSession?.user?.id);
      setReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session?.user?.id), [loadProfile, session]);

  const value = {
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    ready,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
