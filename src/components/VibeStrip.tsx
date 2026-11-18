import { useEffect, useState } from "react";
import { clipsFor, savedClips, searchLinks } from "@/lib/media";
import type { Place } from "@/lib/places";

const pill =
  "inline-flex min-h-11 items-center gap-1 rounded-full pop press bg-card px-4 text-sm font-medium hover:border-primary";

// "Videos": one pill next to Directions / Reviews. Opens the place's clips (if any)
// and quick links to search it on TikTok, Reels and Shorts.
// Renders as siblings so it can sit inside a parent's flex-wrap row of buttons.
export function VibeStrip({ place }: { place: Place }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<string[]>([]);

  useEffect(() => {
    setMine(savedClips(place.id));
  }, [place.id]);
  const clips = clipsFor(place.id, mine);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`${pill} ${open ? "border-primary text-primary" : ""}`}
      >
        ▶ Videos{clips.length ? ` (${clips.length})` : ""}
      </button>
      {open && (
        <div className="w-full basis-full space-y-3 pt-1">
          {clips.length > 0 && (
            <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
              {clips.map((c) => (
                <div
                  key={c.platform + c.id}
                  className="w-56 shrink-0 snap-start overflow-hidden rounded-2xl bg-card"
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
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {clips.length ? "More on" : "Search on"}
            </span>
            {searchLinks(place).map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm font-medium hover:border-primary hover:text-primary"
              >
                {s.label} ↗
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
