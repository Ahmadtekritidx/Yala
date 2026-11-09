import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchStays } from "@/lib/city.functions";
import type { Base } from "@/lib/city";
import { searchItems, useDebouncedSearch } from "@/hooks/use-debounced-search";

// "Where are you staying?": a hotel, an Airbnb street or a neighbourhood. Optional.
export function StayPicker({ base, near, onChange }: { base: Base | null; near: { lat: number; lng: number }; onChange: (b: Base | null) => void }) {
  const search = useServerFn(searchStays);
  const [q, setQ] = useState("");
  const found = useDebouncedSearch(
    q,
    (query) => search({ data: { q: query, lat: near.lat, lng: near.lng } }).then((r) => r.stays),
    `${near.lat},${near.lng}`,
  );
  const list = searchItems(found);
  const msg =
    found.status === "failed" ? "Search is not available right now."
    : found.status === "done" && !found.items.length ? "Nothing found. Try the hotel name or the area."
    : "";

  if (base) {
    return (
      <div className="flex w-full items-center gap-2 rounded-2xl pop bg-card px-4 py-2">
        <span aria-hidden>🏨</span>
        <p className="min-w-0 flex-1 truncate text-sm font-bold">{base.name}</p>
        <button type="button" onClick={() => onChange(null)} className="min-h-11 text-sm font-bold text-primary">change</button>
      </div>
    );
  }
  return (
    <div className="w-full">
      <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Where are you staying?"
        placeholder="Hotel or area (optional), e.g. Sultanahmet"
        className="min-h-12 w-full rounded-2xl pop bg-card px-4 text-base outline-none focus:border-primary" />
      {list.length > 0 && (
        <ul className="mt-2 rounded-2xl pop bg-card p-1">
          {list.map((s) => (
            <li key={`${s.name}-${s.lat}`}>
              <button type="button" onClick={() => { onChange({ name: s.name, lat: s.lat, lng: s.lng }); setQ(""); }}
                className="flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-background">
                <span className="text-sm font-bold">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-1 text-xs text-muted-foreground" role="status">{msg}</p>}
    </div>
  );
}
