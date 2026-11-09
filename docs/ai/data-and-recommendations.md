# Data and recommendations

> "Should we build a collaborative-filtering recommendation engine?"
> **Short answer:** not yet, but **start collecting the data today.** A recommendation engine is only as good as the interaction history behind it, and history can't be collected after the fact. Logging is cheap, and it pays off immediately in evals and debugging long before any model is trained.

**Read first:** [Playbook](playbook.md) · [Yalla AI review](yalla-review.md)

---

## 1. Why not collaborative filtering today

Collaborative filtering (CF) learns "people like you liked X" from a table of **users × items × interactions**. Today we have:

- **No users.** There are no accounts, and profiles live only in the browser.
- **No interactions stored.** Picks, swaps and shares disappear.
- **Low frequency.** People plan weekends maybe once a week, so each user produces few data points.
- **A new catalogue in each city.** Live Google places appear on demand, so most items have no history.

That is the **cold-start problem** on both sides. CF trained on this would be noise. What works now is **content-based scoring** (what we know about the place and the request) plus logging, with **online learning** to start improving from day one.

---

## 2. Log #1: AI calls

One row per model call. This is for cost, latency, quality and debugging.

```ts
type AiCallLog = {
  id: string;                 // uuid
  requestId: string;          // ties together all calls for one plan request
  route: "parse" | "plan" | "copy" | "reel" | "judge" | "status";
  model: string;              // "claude-haiku-5-5"
  effort: "low" | "medium" | "high";
  promptVersion: string;      // bump on every prompt change, e.g. "parse@3"
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  latencyMs: number;
  stopReason: string;         // end_turn | max_tokens | refusal | ...
  ok: boolean;
  errorKind?: "credits" | "busy" | "key" | "refused" | "schema" | "other";
  invariantViolations: number; // closed stop, over time, over drive... should be 0
  at: string;                 // ISO time
};
```

Everything you need is already on the Anthropic response (`usage`, `stop_reason`). `askJSON` in `src/lib/ai.server.ts` is the single place to add it.

## 3. Log #2: product events

One row per thing the user sees or does. This is the training data for ranking and recommendations.

```ts
type Event = {
  id: string;
  anonId: string;      // random uuid kept in the browser; no personal data
  sessionId: string;
  requestId?: string;  // which plan request this belongs to
  type:
    | "plan_requested"  // parsed intent, city, chips, time window, group size
    | "plans_shown"     // IMPRESSIONS: every place id shown, with its plan and position
    | "plan_opened"
    | "stop_swapped"    // from placeId → to placeId  (negative signal for "from")
    | "stop_removed"    // negative signal
    | "stop_added"      // positive signal, plus which category was missing
    | "plan_shared"     // strong positive signal
    | "share_opened"    // a friend opened the link: group-level signal
    | "place_clicked"   // maps / instagram / website
    | "reel_saved";     // explicit "I want to go here"
  placeId?: string;
  props: Record<string, unknown>; // context: day, time, area, people, budget, prefs
  at: string;
};
```

**Rules that save you later:**
- **Log impressions, not just clicks.** You can't learn "shown but ignored" if you didn't record what was shown. Without impressions, a ranking model learns popularity, not preference.
- **Log the context with every event**: day, time window, area, group size, budget, preferences. Recommendations here depend heavily on context; Saturday brunch for 6 isn't Friday dinner for 2.
- **Version everything.** `promptVersion`, `rankerVersion`. Otherwise you can't tell which change helped.
- **Use an anonymous id.** A random id kept in the browser is enough. Accounts can link to it later.
- **Privacy:** update the privacy notice, set a retention period, keep no personal details. Free text from the request is useful for evals; strip anything that looks like a phone number or email.

**Where to store it:** a single Postgres `events` table is enough for a long time. Lovable Cloud (Supabase) is the path of least resistance in this project. A product analytics tool (e.g. PostHog) adds dashboards and funnels, but keep a raw copy you control, because you'll want to train on it.

---

## 4. The ladder: from no data to collaborative filtering

Climb one rung at a time. Each rung needs the one before it as a baseline to beat in an A/B test.

| Rung | What | Needs | Yalla |
|---|---|---|---|
| 0 | **Rules + scoring formula**: rating adjusted for review count, distance, opening hours, profile match | Nothing | Do now (target architecture step 3) |
| 1 | **Context popularity**: "most shared brunch spots in Batroun on Saturdays" | Event logs, a few weeks | Simple SQL; strong baseline |
| 2 | **Online learning with bandits**: each place gets a learned boost; show mostly the best, sometimes explore; reward = kept and not swapped, or shared | Event logs from day one | **The "build it online" option.** Learns from live traffic with very little data |
| 3 | **Item-to-item co-occurrence**: "places that appear together in shared plans" / "saved X, also saved Y" | Hundreds of shared plans per city | Powers "more like this reel" and better Add suggestions |
| 4 | **Learning to rank**: a gradient-boosted ranking model (e.g. LightGBM LambdaMART) on place + context features, labels from shown / kept / swapped / shared | Thousands of logged sessions with impressions | Replaces the hand-written scoring formula |
| 5 | **Collaborative filtering / two-tower models**: user and place embeddings learned from interactions | Many repeat users with many interactions each; accounts | Only when we have a real returning user base |
| + | **Content embeddings**: embed place descriptions, reviews and reel captions; match on "vibe" | No interaction data needed | Useful early for cold start; pairs well with rungs 3–5 |

The thresholds are rules of thumb. The real test is always: **does it beat the rung below in an A/B test on share rate?**

### "Build it online" vs "start collecting data": both, in this order

1. **This week:** ship the two logs above.
2. **Next:** rung 0 (scoring in code) and rung 1 (context popularity from SQL).
3. **Then:** rung 2, a bandit on top of the scoring formula. This is how to "learn online" with little data. It improves from live traffic, needs no training pipeline, and keeps exploring so new places get a fair chance (cold start).
4. **Later:** rungs 3–5 as volume grows. By then you have months of clean, versioned data with impressions to train on.

An off-the-shelf recommendation service doesn't skip any of this. It needs the same event stream and the same volume.

---

## 5. Metrics to track from day one

| Metric | Meaning | Good direction |
|---|---|---|
| Time to first plan (p50 / p95) | Speed | ↓ (PRD target: 5 s) |
| Picked-plan rate | % of requests where a plan is opened | ↑ |
| Swap rate per stop | How often a suggestion was wrong | ↓ |
| Share rate | The north-star: the plan was good enough to send | ↑ |
| Share-open rate | Friends opened it: group reach | ↑ |
| Invariant violations | Closed / over-time / over-drive stops shown | = 0 |
| Cost per shared plan | AI + Google spend ÷ shares | ↓ |
