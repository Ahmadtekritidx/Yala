import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { cityFromLocation, searchCities } from "@/lib/city.functions";
import { cityLabel, LEBANON, recentCities, type City } from "@/lib/city";

const POPULAR: City[] = [
  LEBANON,
  { name: "Riyadh", country: "Saudi Arabia", cc: "SA", lat: 24.7136, lng: 46.6753 },
  { name: "Jeddah", country: "Saudi Arabia", cc: "SA", lat: 21.4858, lng: 39.1925 },
  { name: "Dubai", country: "United Arab Emirates", cc: "AE", lat: 25.2048, lng: 55.2708 },
  { name: "Amman", country: "Jordan", cc: "JO", lat: 31.9539, lng: 35.9106 },
  { name: "Cairo", country: "Egypt", cc: "EG", lat: 30.0444, lng: 31.2357 },
  { name: "Istanbul", country: "Türkiye", cc: "TR", lat: 41.0082, lng: 28.9784 },
  { name: "Paris", country: "France", cc: "FR", lat: 48.8566, lng: 2.3522 },
];

// "📍 Riyadh, Saudi Arabia · change": search any city, use my location, or a popular pick.
export function CityPicker({ city, onChange }: { city: City; onChange: (c: City) => void }) {
  const search = useServerFn(searchCities);
  const near = useServerFn(cityFromLocation);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<City[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const [recent, setRecent] = useState<City[]>([]);
  useEffect(() => {
    if (open) {
      input.current?.focus();
      setRecent(recentCities());
    }
  }, [open]);
  const same = (a: City, b: City) => a.name === b.name && a.cc === b.cc;
  const list = results.length
    ? results
    : q.trim().length < 2
      ? [...recent, ...POPULAR.filter((c) => !recent.some((r) => same(r, c)))]
      : [];

  // Debounced Google city search
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      search({ data: { q: q.trim() } })
        .then((r) => {
          setResults(r.cities);
          setMsg(r.cities.length ? "" : "No city found. Try the English name.");
        })
        .catch(() => setMsg("Search is not available right now."));
    }, 350);
    return () => clearTimeout(t);
  }, [q, search]);

  const pick = (c: City) => {
    onChange(c);
    setOpen(false);
    setQ("");
    setResults([]);
    setMsg("");
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setMsg("Your browser can't share location.");
      return;
    }
    setBusy(true);
    setMsg("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await near({ data: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
          if (r.city) pick(r.city);
          else setMsg("Couldn't tell which city you're in. Search it instead.");
        } catch {
          setMsg("Couldn't tell which city you're in. Search it instead.");
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        setMsg("Location is off. Search your city instead.");
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-2 rounded-full pop press bg-card px-4 text-sm font-bold"
      >
        📍 {cityLabel(city)}{" "}
        <span className="font-medium text-primary">{open ? "close" : "change"}</span>
      </button>
      {open && (
        <div className="mt-3 rounded-2xl pop bg-card p-3">
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search any city: Riyadh, Dubai, London…"
            className="min-h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={locate}
            disabled={busy}
            className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-primary hover:bg-background disabled:opacity-50"
          >
            {busy ? "Finding you…" : "◎ Use my location"}
          </button>
          <ul className="mt-1">
            {list.map((c) => (
              <li key={`${c.name}-${c.cc}-${c.lat}`}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm hover:bg-background"
                >
                  <span className="font-medium">{cityLabel(c)}</span>
                  {c.cc === city.cc && c.name === city.name && (
                    <span className="text-primary">✓</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {msg && (
            <p className="mt-1 px-3 text-xs text-muted-foreground" role="status">
              {msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
