import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase.js";

// Firebase-Auth equivalent of the marketing site's useNetlifyIdentity.js —
// same `ready` flag convention, so "has the auth state settled yet" reads
// the same way across both codebases.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [ready, setReady] = useState(false);

  const refreshRole = useCallback(async () => {
    if (!auth.currentUser) return null;
    // Custom claims only land in the ID token on next mint, force a
    // refresh right after signup or after an admin promotes this user.
    const result = await auth.currentUser.getIdTokenResult(true);
    const nextRole = result.claims.role ?? null;
    setRole(nextRole);
    return nextRole;
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setRole(null);
        setReady(true);
        return;
      }
      const result = await nextUser.getIdTokenResult();
      setRole(result.claims.role ?? null);
      setReady(true);
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const unsubProfile = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return unsubProfile;
  }, [user]);

  const value = { user, profile, role, ready, refreshRole };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
