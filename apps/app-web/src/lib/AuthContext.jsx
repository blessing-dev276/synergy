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
  // "View as Member" (admin-only preview toggle) -- sessionStorage, not
  // localStorage: it's a transient "what I'm doing right now" mode, not a
  // lasting preference, so it shouldn't silently survive a browser restart.
  // Doesn't touch `role` itself anywhere -- RoleGuard is the only thing
  // that reads this, everything security-relevant (RLS) still runs off the
  // real profiles.role in the database, completely unaffected by this flag.
  const [viewingAsMember, setViewingAsMember] = useState(() => sessionStorage.getItem("viewAsMember") === "true");

  const setViewAsMember = useCallback((next) => {
    setViewingAsMember(next);
    if (next) sessionStorage.setItem("viewAsMember", "true");
    else sessionStorage.removeItem("viewAsMember");
  }, []);

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

  const role = profile?.role ?? null;
  // Defensive only (a real member should never end up with this set, and
  // the toggle is only ever rendered for admins) -- guards a stale flag
  // left in sessionStorage from mattering on the wrong account.
  const viewAsMember = role === "admin" && viewingAsMember;

  const value = {
    user: session?.user ?? null,
    profile,
    role,
    ready,
    refreshProfile,
    viewAsMember,
    setViewAsMember,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
