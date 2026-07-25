import { useEffect, useState } from "react";

// Netlify Identity's widget script loads async from a CDN, so it may not be
// on `window` yet when an admin page mounts — poll briefly instead of
// assuming it's already there.
export function useNetlifyIdentity() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let poll;

    const bind = (identity) => {
      setUser(identity.currentUser());
      setReady(true);
      const onLogin = (u) => {
        setUser(u);
        identity.close();
      };
      const onLogout = () => setUser(null);
      identity.on("login", onLogin);
      identity.on("logout", onLogout);
      return () => {
        identity.off("login", onLogin);
        identity.off("logout", onLogout);
      };
    };

    let cleanup = () => {};
    if (window.netlifyIdentity) {
      cleanup = bind(window.netlifyIdentity);
    } else {
      poll = setInterval(() => {
        if (window.netlifyIdentity && !cancelled) {
          clearInterval(poll);
          cleanup = bind(window.netlifyIdentity);
        }
      }, 100);
    }

    return () => {
      cancelled = true;
      clearInterval(poll);
      cleanup();
    };
  }, []);

  return { user, ready };
}

export async function getIdentityToken() {
  const user = window.netlifyIdentity?.currentUser();
  if (!user) throw new Error("You've been logged out — log in again.");
  return user.jwt();
}
