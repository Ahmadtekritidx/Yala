// Browser side of the product-event log. Fire and forget: tracking must never break or slow the app.
// The server side is src/lib/track.functions.ts; the full list of events is EVENT_NAMES below.

export const EVENT_NAMES = [
  "plans_shown", // 3 plans on screen (fresh or from this tab's cache)
  "plans_error", // the planner returned an error message
  "plans_shuffled", // "Shuffle" asked for new plans
  "plan_picked", // "Pick this plan" / "Open the trip"
  "stop_removed",
  "stop_remove_undone",
  "stop_swapped",
  "stop_added",
  "stop_add_failed", // Add found nothing that fits the rules
  "plan_opened", // a shared plan page was opened
  "plan_shared", // Share button (share sheet or copied link)
  "plan_whatsapp",
  "plan_calendar",
  "plan_directions",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];
type Props = Record<string, string | number | boolean | null>;

const DEVICE_KEY = "yalla:device";

// A random id made on this device, so events from the same browser can be grouped. Not linked to a person.
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) localStorage.setItem(DEVICE_KEY, (id = crypto.randomUUID()));
    return id;
  } catch {
    return (memoryId ??= crypto.randomUUID());
  }
}
let memoryId: string | undefined;

let queue: { name: EventName; runId?: string; props: Props }[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

// Queues one event; queued events are sent together after a short pause (or when the page hides).
export function track(name: EventName, props: Props = {}, runId?: string) {
  if (typeof window === "undefined") return;
  queue.push({ name, props, ...(runId ? { runId } : {}) });
  if (queue.length >= 20) return flush();
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

function flush() {
  clearTimeout(timer);
  if (!queue.length) return;
  const events = queue;
  queue = [];
  // Imported lazily so this file stays free of server code for the browser bundle.
  void import("./track.functions")
    .then(({ trackEvents }) => trackEvents({ data: { device: deviceId(), events } }))
    .catch(() => {});
}

if (typeof window !== "undefined") {
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
