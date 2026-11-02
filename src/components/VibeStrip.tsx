import { useEffect, useState } from "react";
import { clipsFor, parseClip, removeClip, saveClip, savedClips, searchLinks } from "@/lib/media";
import { expandLink } from "@/lib/media.functions";
import type { Place } from "@/lib/places";
import { useServerFn } from "@tanstack/react-start";

// "Vibe check": short videos of a stop, plus search shortcuts and paste-a-link.
export function VibeStrip({ place }: { place: Place }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setMine(savedClips(place.id));
  }, [place.id]);
  const clips = clipsFor(place.id, mine);

  const expand = useServerFn(expandLink);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    let c = parseClip(link);
    if (!c && /^https?:\/\//.test(link.trim())) {
      setBusy(true);
      try {
        c = parseClip((await expand({ data: { url: link.trim() } })).url);
      } catch {
        /* fall through */
      }
      setBusy(false);
    }
    if (!c) {
      setErr("Paste a full TikTok, Instagram reel or YouTube Shorts link");
      return;
    }
    saveClip(place.id, c.url);
    setMine((m) => [c.url, ...m.filter((x) => x !== c.url)]);
    setLink("");
    setErr("");
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1 rounded-full pop press bg-card px-4 text-sm font-medium hover:border-primary"
      >
        ▶ Vibe check{clips.length ? ` · ${clips.length}` : ""}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {clips.length > 0 && (
            <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
              {clips.map((c) => (
                <div
                  key={c.platform + c.id}
                  className="relative w-56 shrink-0 snap-start overflow-hidden rounded-2xl bg-card"
                  style={{ aspectRatio: "9 / 16" }}
                >
                  <iframe
                    src={c.embed}
                    title={`${place.name} video`}
                    loading="lazy"
                    className="h-full w-full border-0"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                  {mine.includes(c.url) && (
                    <button
                      aria-label="Remove video"
                      onClick={() => {
                        removeClip(place.id, c.url);
                        setMine((m) => m.filter((x) => x !== c.url));
                      }}
                      className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-background/80 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {clips.length ? "More on" : "Watch on"}
            </span>
            {[...(place.insta ? [{ label: "Their Insta", href: place.insta }] : []), ...searchLinks(place)].map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center rounded-full bg-card px-3 text-xs font-bold hover:text-primary"
              >
                {s.label} ↗
              </a>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
              placeholder="Paste a reel or TikTok link"
              inputMode="url"
              className="min-h-11 min-w-0 flex-1 rounded-full border border-border bg-transparent px-4 text-sm"
            />
            <button
              onClick={() => void add()}
              disabled={!link.trim() || busy}
              className="min-h-11 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {busy ? "…" : "Add"}
            </button>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
      )}
    </div>
  );
}
