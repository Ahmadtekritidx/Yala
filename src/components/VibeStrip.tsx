import { useEffect, useState } from "react";
import { clipsFor, savedClips, searchLinks } from "@/lib/media";
import type { Place } from "@/lib/places";
import { Play } from "lucide-react";

const pill =
  "inline-flex min-h-11 items-center gap-1 rounded-full pop press bg-card px-4 text-sm font-medium hover:border-primary";

// Round icon button used for secondary actions in a stop's button row.
export const ICON_BTN =
  "relative grid h-11 w-11 place-items-center rounded-full pop press bg-card hover:border-primary";

// "Videos": a button in the stop's action row (icon-only next to Directions, or a labeled pill).
// Opens the place's clips (if any) and quick links to search it on TikTok, Reels and Shorts.
// Renders as siblings so it can sit inside a parent's flex-wrap row of buttons.
export function VibeStrip({ place, iconOnly = false }: { place: Place; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<string[]>([]);

  useEffect(() => {
    setMine(savedClips(place.id));
  }, [place.id]);
  const clips = clipsFor(place.id, mine);

  return (
    <>
      {iconOnly ? (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Videos${clips.length ? ` (${clips.length})` : ""}`}
          title="Videos"
          className={`${ICON_BTN} ${open ? "border-primary text-primary" : ""}`}
        >
          <Play className="h-5 w-5" aria-hidden />
          {clips.length > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {clips.length}
            </span>
          )}
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`${pill} ${open ? "border-primary text-primary" : ""}`}
        >
          <Play className="h-4 w-4" aria-hidden />
          Videos{clips.length ? ` (${clips.length})` : ""}
        </button>
      )}
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
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {clips.length ? "More on" : "Search on"}
            </span>
            {searchLinks(place).map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-xs font-bold hover:border-primary hover:text-primary"
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
