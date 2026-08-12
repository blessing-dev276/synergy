import { useCallback, useEffect, useState } from "react";

// Every page follows the same {loading, error, data, refetch} shape.
// `buildQuery` returns a fresh Supabase query builder (or null/undefined
// when not ready to query yet, e.g. waiting on `user`) — rebuilt on every
// call so `refetch()` after a mutation re-runs the same query.
export function useSupabaseQuery(buildQuery, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const refetch = useCallback(async () => {
    const query = buildQuery();
    if (!query) {
      setState({ loading: false, error: null, data: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const { data, error } = await query;
    setState({ loading: false, error: error ?? null, data: error ? null : data });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { ...state, refetch };
}
