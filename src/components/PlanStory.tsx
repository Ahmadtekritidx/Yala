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
              <PlaceScene key={s.placeId + i} lat={s.pl!.lat} lng={s.pl!.lng} emoji={EMOJI[s.pl!.cat]} />
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-5 pt-20">
              <div className="flex items-end justify-between gap-3">
                <p className="font-display text-4xl font-extrabold text-accent">{fmt(s.time)}</p>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
                  ★ {s.pl!.rating.toFixed(1)} · {"$".repeat(s.pl!.price)}
                </span>
              </div>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest opacity-80">
                Stop {i + 1} of {stops.length} · {s.pl!.cat} · {s.pl!.area}
              </p>
              <p className="mt-1 font-display text-3xl font-bold leading-tight">{s.pl!.name}</p>
              <p className="text-lg opacity-90">{s.reason}</p>
              {s.pl!.hours && <p className="mt-1 text-sm opacity-70">{s.pl!.hours}</p>}
              <a
                href={s.pl!.maps ?? `https://www.google.com/maps/search/?api=1&query=${s.pl!.lat},${s.pl!.lng}`}
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto relative z-30 mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-black"
              >
                📍 Open in Maps
              </a>
              {after && (
                <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur">
                  <span className="text-2xl" aria-hidden>{EMOJI[after.pl!.cat]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                      Up next · {fmt(after.time)}
                    </p>
                    <p className="truncate font-semibold">{after.pl!.name}</p>
                  </div>
                  <span className="text-sm opacity-80">🚗 {driveMins(s.pl!, after.pl!)} min</span>
                </div>
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

// Real satellite imagery of the spot (Esri World Imagery, no key needed) with a slow Ken Burns push-in and a live pin.
const Z = 17;
function PlaceScene({ lat, lng, emoji }: { lat: number; lng: number; emoji: string }) {
  const n = 2 ** Z;
  const fx = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx);
  const ty = Math.floor(fy);
  const T = 256;
  // offset so the exact coordinate sits at the centre of the 5x5 grid
  const ox = -((fx - tx + 2) * T);
  const oy = -((fy - ty + 2) * T);
  const tiles = [];
  for (let dy = 0; dy < 5; dy++)
    for (let dx = 0; dx < 5; dx++)
      tiles.push(
        <img
          key={`${dx}-${dy}`}
          alt=""
          draggable={false}
          src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${ty - 2 + dy}/${tx - 2 + dx}`}
          className="absolute select-none"
          style={{ width: T, height: T, left: dx * T, top: dy * T }}
        />,
      );
  return (
    <div className="absolute inset-0 overflow-hidden bg-neutral-800">
      <div className="absolute left-1/2 top-[42%] animate-[kenburns_6s_ease-out_forwards]">
        <div className="absolute" style={{ left: ox, top: oy, width: 5 * T, height: 5 * T }}>
          {tiles}
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent" />
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-full">
        <span className="absolute left-1/2 top-full h-16 w-16 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-primary/60" />
        <div className="relative grid h-16 w-16 place-items-center rounded-full border-4 border-white bg-primary text-3xl shadow-2xl">
          {emoji}
        </div>
        <div className="mx-auto h-3 w-1 bg-white" />
      </div>
    </div>
  );
}
