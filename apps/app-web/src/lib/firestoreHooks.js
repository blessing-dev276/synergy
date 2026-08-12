import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";

// Thin wrapper so every page follows the same {loading, error, data} shape
// instead of hand-rolling try/catch + state around each Firestore listener.
export function useLiveQuery(queryRef, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    if (!queryRef) return undefined;
    setState({ loading: true, error: null, data: null });
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        const data = "docs" in snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : snap.exists() ? { id: snap.id, ...snap.data() } : null;
        setState({ loading: false, error: null, data });
      },
      (error) => setState({ loading: false, error, data: null }),
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
