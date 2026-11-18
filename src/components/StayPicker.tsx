import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchStays } from "@/lib/city.functions";
import type { Base } from "@/lib/city";
import { searchItems, useDebouncedSearch } from "@/hooks/use-debounced-search";

// "Where are you staying?": a hotel, an Airbnb, your house or a neighbourhood. Optional:
// starts as an "Add" button, and a picked stay has a remove button.
export function StayPicker({
  base,
  near,
  onChange,
}: {
  base: Base | null;
  near: { lat: number; lng: number };
  onChange: (b: Base | null) => void;
}) {
  const search = useServerFn(searchStays);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const found = useDebouncedSearch(
    q,
    (query) => search({ data: { q: query, lat: near.lat, lng: near.lng } }).then((r) => r.stays),
    `${near.lat},${near.lng}`,
  );
  const list = searchItems(found);
  const msg =
    found.status === "failed"
      ? "Search is not available right now."
      : found.status === "done" && !found.items.length
        ? "Nothing found. Try the hotel name or the area."
        : "";

  if (base) {
    return (
      <div className="flex w-full items-center gap-2 rounded-2xl pop bg-card px-4 py-2">
        <span aria-hidden>🏨</span>
        <p className="min-w-0 flex-1 truncate text-sm font-bold">{base.name}</p>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setOpen(true);
          }}
          className="min-h-11 px-2 text-sm font-bold text-primary"
        >
          change
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          aria-label={`Remove ${base.name}`}
          className="min-h-11 min-w-11 rounded-full text-lg font-bold text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-full pop press bg-card px-4 text-sm font-bold"
      >
        + Add where you're staying
      </button>
    );
  }
  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          aria-label="Where are you staying?"
          placeholder="Hotel, Airbnb or your street, e.g. Mar Mikhael"
          className="min-h-12 min-w-0 flex-1 rounded-2xl pop bg-card px-4 text-base outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => {
            setQ("");
            setOpen(false);
          }}
          className="min-h-11 px-2 text-sm font-bold text-muted-foreground"
        >
          cancel
        </button>
      </div>
      {list.length > 0 && (
        <ul className="mt-2 rounded-2xl pop bg-card p-1">
          {list.map((s) => (
            <li key={`${s.name}-${s.lat}`}>
              <button
                type="button"
                onClick={() => {
                  onChange({ name: s.name, lat: s.lat, lng: s.lng });
                  setQ("");
                  setOpen(false);
                }}
                className="flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-background"
              >
                <span className="text-sm font-bold">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && (
        <p className="mt-1 text-xs text-muted-foreground" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
