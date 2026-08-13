import { useEffect, useState } from "react";

// Used by SponsorPicker's live search-as-you-type — the codebase had no
// debounce utility before search_sponsors made that a real need (the old
// list_inviters dropdown loaded everyone once and filtered client-side).
export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
