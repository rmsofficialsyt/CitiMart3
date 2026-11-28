import { useEffect, useState } from "react";

/** The value, `delayMs` after it last changed. Search boxes feed their query
 * key from this so typing "kurta" is one request, not five. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
