import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { readReel } from "@/lib/media.functions";
import { isLebanon, loadCity } from "@/lib/city";
import { addSaved, loadSaved, removeSaved, type Saved } from "@/lib/saved";

// Paste a reel / TikTok link, we find the place and keep it in "Want to go".
export function SavedReels({ onPlan }: { onPlan: (areas: string[]) => void }) {
  const read = useServerFn(readReel);
  const [list, setList] = useState<Saved[]>([]);
  const [url, setUrl] = useState("");
  const [hint, setHint] = useState("");
  const [needHint, setNeedHint] = useState(false);
  const [busy, setBusy] = useState(false);
  // Same as busy, but set at once: Enter in either box while a link is being read does nothing,
  // instead of starting a second read (and a second AI call) before React re-renders.
  const reading = useRef(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setList(loadSaved());
  }, []);

  // Links shared into the app (PWA share target / ?share=) land here.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const shared = p.get("share") || p.get("url") || p.get("text")?.match(/https?:\/\/\S+/)?.[0];
    if (shared) {
      setUrl(shared);
      void go(shared);
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function go(link = url) {
    if (reading.current) return;
    const u = link.trim().match(/https?:\/\/\S+/)?.[0];
    if (!u) {
      setMsg("Paste a TikTok, Instagram or YouTube link");
      return;
    }
    if (/instagram\.com/.test(u) && !hint.trim()) {
      setNeedHint(true);
      setMsg("Instagram hides captions. Type the place name, then Save.");
      return;
    }
    reading.current = true;
    setBusy(true);
    setMsg("");
    try {
      const r = await read({ data: { url: u, hint, ...(isLebanon(loadCity()) ? {} : { city: loadCity() }) } });
      if ("error" in r) {
        setMsg(r.error);
        setNeedHint(true);
        return;
      }
      setList(addSaved({ place: r.place, url: r.url, dish: r.dish }));
      setMsg(`Saved ${r.place.name} ✓`);
      setUrl("");
      setHint("");
      setNeedHint(false);
    } catch {
      setMsg("Something broke. Try again?");
    } finally {
      reading.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-bold">Saved from reels</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Saw a place on TikTok or Insta? Drop the link, we turn it into your weekend.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void go();
          }}
          placeholder="Paste a reel or TikTok link"
          inputMode="url"
          className="min-h-12 min-w-0 flex-1 rounded-2xl pop bg-card px-4 text-base outline-none focus:border-primary"
        />
        <button
          onClick={() => void go()}
          disabled={busy || !url.trim()}
          className="min-h-12 rounded-2xl pop press bg-primary px-5 font-bold text-primary-foreground disabled:opacity-40"
        >
          {busy ? "Reading…" : "Save"}
        </button>
      </div>
      {needHint && (
        <input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void go();
          }}
          placeholder="Place name (e.g. Chez Maguy, Batroun)"
          className="mt-2 min-h-11 w-full rounded-2xl pop bg-card px-4 text-sm outline-none focus:border-primary"
        />
      )}
      {msg && (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {msg}
        </p>
      )}

      {list.length > 0 && (
        <>
          <ul className="mt-4 space-y-2">
            {list.map((s) => (
              <li key={s.place.id} className="flex items-center gap-3 rounded-2xl pop bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{s.place.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.place.cat} · {s.place.area}
                    {s.dish ? ` · get the ${s.dish}` : ""}
                  </p>
                </div>
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open video"
                    className="grid h-11 w-11 place-items-center rounded-full border border-border hover:border-primary"
                  >
                    ▶
                  </a>
                )}
                <button
                  aria-label={`Remove ${s.place.name}`}
                  onClick={() => setList(removeSaved(s.place.id))}
                  className="grid h-11 w-11 place-items-center rounded-full border border-border hover:border-primary"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => onPlan([...new Set(list.map((s) => s.place.area))])}
            className="mt-4 min-h-14 w-full rounded-2xl pop press bg-accent font-display text-lg font-extrabold text-accent-foreground"
          >
            Plan my weekend from my saves ({list.length})
          </button>
        </>
      )}
    </section>
  );
}
