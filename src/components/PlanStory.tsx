import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { byId, driveMins, fmt, type Category } from "@/lib/places";
import { clipsFor, parseClip, savedClips } from "@/lib/media";
import type { Shared } from "@/lib/share";

const EMOJI: Record<Category, string> = {
  Breakfast: "🥙",
  Brunch: "🍳",
  Lunch: "🍽️",
  Dinner: "🍷",
  "Specialty coffee": "☕",
  Dessert: "🍦",
  "Sea view": "🌅",
  Walk: "🚶",
  Hike: "🥾",
  "Scenic stop": "⛰️",
  Stay: "🛏️",
};
const STILL_MS = 5000;

// Full-screen, Instagram-story style walk through the plan: one slide per stop, then an end card.
export function PlanStory({
  plan,
  onClose,
  onShare,
}: {
  plan: Shared;
  onClose: () => void;
  onShare: () => void;
}) {
  const stops = plan.stops.map((s) => ({ ...s, pl: byId(s.placeId) })).filter((s) => !!s.pl);
  const total = stops.length + 1;
  const [i, setI] = useState(0);
  const [clips, setClips] = useState<(string | undefined)[]>([]);

  useEffect(() => {
    setClips(
      stops.map((s, k) => {
        const shared = plan.clips?.[k] ? parseClip(plan.clips[k]!) : null;
        return (shared ?? clipsFor(s.placeId, savedClips(s.placeId))[0])?.embed;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const next = useCallback(() => setI((x) => Math.min(x + 1, total - 1)), [total]);
  const prev = useCallback(() => setI((x) => Math.max(x - 1, 0)), []);
  const embed = clips[i];

  // Stills auto-advance; videos wait for the user to tap next.
  useEffect(() => {
    if (i >= total - 1 || embed) return;
    const t = setTimeout(next, STILL_MS);
    return () => clearTimeout(t);
  }, [i, embed, total, next]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [next, prev, onClose]);

  const s = stops[i];
  const after = stops[i + 1];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${plan.title} story`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
    >
      <div
        className="relative h-full w-full max-w-[min(100vw,56.25vh)] overflow-hidden bg-neutral-900 text-white sm:rounded-2xl"
        style={{ maxHeight: "100dvh" }}
      >
        {/* progress */}
        <div className="absolute inset-x-3 top-3 z-20 flex gap-1">
          {Array.from({ length: total }, (_, k) => (
            <div key={k} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className={`h-full bg-white ${k === i && !embed && k < total - 1 ? "animate-[story_5s_linear_forwards]" : ""}`}
                style={{
                  width:
                    k < i
                      ? "100%"
                      : k === i && (embed || k === total - 1)
                        ? "100%"
                        : k === i
                          ? undefined
                          : "0%",
                }}
              />
            </div>
          ))}
        </div>
        <div className="absolute inset-x-3 top-6 z-20 flex items-center justify-between">
          <p className="font-display text-sm font-extrabold">
            yalla<span className="text-primary">.</span>{" "}
            <span className="font-sans font-normal opacity-80">{plan.title}</span>
          </p>
          <button
            onClick={onClose}
            aria-label="Close story"
            className="grid h-11 w-11 place-items-center text-xl"
          >
            ✕
          </button>
        </div>

        {s ? (
          <>
            {embed ? (
              <iframe
                key={embed}
                src={embed}
                title={`${s.pl!.name} video`}
                className="absolute inset-0 h-full w-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-primary via-secondary to-accent">
                <span className="text-[9rem] drop-shadow-lg" aria-hidden>
                  {EMOJI[s.pl!.cat]}
                </span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-5 pt-20">
              <p className="font-display text-4xl font-extrabold text-accent">{fmt(s.time)}</p>
              <p className="text-xs font-bold uppercase tracking-widest opacity-80">
                Stop {i + 1} of {stops.length} · {s.pl!.cat}
              </p>
              <p className="mt-1 font-display text-2xl font-bold leading-tight">{s.pl!.name}</p>
              <p className="opacity-90">{s.reason}</p>
              {after && (
                <p className="mt-2 text-sm opacity-70">
                  Next: {after.pl!.name} · {driveMins(s.pl!, after.pl!)} min drive
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-br from-primary to-secondary p-6">
            <p className="font-display text-4xl font-extrabold leading-tight">{plan.title}</p>
            <p className="mt-2 text-lg opacity-90">{plan.vibe}</p>
            <ol className="mt-6 space-y-1">
              {stops.map((x) => (
                <li key={x.placeId + x.time} className="font-medium">
                  {fmt(x.time)} · {x.pl!.name}
                </li>
              ))}
            </ol>
            <div className="mt-8 grid gap-2">
              <button
                onClick={onShare}
                className="min-h-12 rounded-2xl bg-white font-bold text-black"
              >
                Send to the group
              </button>
              <button
                onClick={() => setI(0)}
                className="min-h-12 rounded-2xl border-2 border-white font-bold"
              >
                Watch again
              </button>
              <Link
                to="/"
                className="min-h-12 rounded-2xl text-center font-bold leading-[3rem] underline"
              >
                Make my own
              </Link>
            </div>
          </div>
        )}

        {/* tap zones: edges only so the video stays playable in the middle */}
        {i < total - 1 && (
          <button
            aria-label="Next stop"
            onClick={next}
            className="absolute bottom-40 right-0 top-20 z-10 w-1/4"
          />
        )}
        {i > 0 && (
          <button
            aria-label="Previous stop"
            onClick={prev}
            className="absolute bottom-40 left-0 top-20 z-10 w-1/4"
          />
        )}
      </div>
    </div>
  );
}
