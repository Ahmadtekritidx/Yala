import { useEffect, useRef, useState } from "react";

// A search-as-you-type box as a small state machine:
//   idle (fewer than 2 letters) ─▶ searching ─▶ done | failed
// Typing again restarts the wait. An answer for an older query is ignored, so a slow
// "Ri" answer can never replace the results for "Riyadh". While searching, the previous
// results stay on screen so the list doesn't flicker.
export type SearchState<T> =
  | { status: "idle" }
  | { status: "searching"; items: T[] }
  | { status: "done"; items: T[] }
  | { status: "failed" };

export const searchItems = <T,>(s: SearchState<T>): T[] => (s.status === "searching" || s.status === "done" ? s.items : []);

// `scope` is anything else the search depends on (e.g. the city to search near), as a string.
export function useDebouncedSearch<T>(q: string, fetch: (q: string) => Promise<T[]>, scope = "", delay = 350): SearchState<T> {
  const [state, setState] = useState<SearchState<T>>({ status: "idle" });
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setState({ status: "idle" });
      return;
    }
    let current = true;
    setState((s) => ({ status: "searching", items: searchItems(s) }));
    const t = setTimeout(() => {
      fetchRef.current(query).then(
        (items) => { if (current) setState({ status: "done", items }); },
        () => { if (current) setState({ status: "failed" }); },
      );
    }, delay);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [q, scope, delay]);

  return state;
}
