// Test-only: fake Google Places API, the Anthropic API and Firecrawl. Fails loudly if a Lovable service is called.
const real = globalThis.fetch;
const CITIES = {
  Riyadh: { c: [24.7136, 46.6753], country: "Saudi Arabia", cc: "SA" },
  Dubai: { c: [25.2048, 55.2708], country: "United Arab Emirates", cc: "AE" },
  Istanbul: { c: [41.0082, 28.9784], country: "Türkiye", cc: "TR" },
};
const city = (n) => ({
  displayName: { text: n },
  location: { latitude: CITIES[n].c[0], longitude: CITIES[n].c[1] },
  addressComponents: [
    { longText: CITIES[n].country, shortText: CITIES[n].cc, types: ["country", "political"] },
  ],
});
const CENTER = {
  Istanbul: CITIES.Istanbul.c,
  Riyadh: CITIES.Riyadh.c,
  Dubai: CITIES.Dubai.c,
  Beirut: [33.895, 35.51],
  Batroun: [34.256, 35.659],
  Jbeil: [34.121, 35.646],
  Jounieh: [33.98, 35.62],
  Tripoli: [34.44, 35.84],
  Broummana: [33.883, 35.62],
  Douma: [34.209, 35.841],
};
const HOURS = [
  "8:00 AM – 11:00 PM",
  "12:00 – 3:30 PM, 7:00 – 11:30 PM",
  "Open 24 hours",
  "Closed",
  "9:00 AM – 2:00 PM",
  "6:00 PM – 1:00 AM",
  "10:00 AM – 10:00 PM",
];
globalThis.__log = [];
function places(q) {
  const m = q.match(/^(.*) in ([^,]*), (.*)$/);
  if (!m)
    return [
      {
        id: "stay1",
        displayName: { text: `${q} Hotel` },
        formattedAddress: `${q}, Fatih, Istanbul`,
        location: { latitude: 41.0055, longitude: 28.9768 },
      },
    ];
  const [kind, area] = [m[1], m[2]];
  const c = CENTER[area] ?? CENTER.Beirut;
  let h = 0;
  for (const ch of q) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: 7 }, (_, i) => ({
    id: `${area}-${kind}-${i}`.replace(/\W+/g, "_"),
    displayName: { text: `${area} ${kind.replace(/^best /, "")} #${i + 1}` },
    location: {
      latitude: c[0] + (((h >>> i) % 20) - 10) / 1000,
      longitude: c[1] + (((h >>> (i + 3)) % 20) - 10) / 1000,
    },
    rating: i === 6 ? 3.6 : 4.1 + ((h >>> i) % 9) / 10,
    userRatingCount: i === 5 ? 10 : 40 + ((h >>> i) % 900),
    priceLevel: ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE"][i % 3],
    googleMapsUri: "https://maps.google.com/?cid=" + i,
    businessStatus: "OPERATIONAL",
    regularOpeningHours: {
      weekdayDescriptions: [
        "Monday: x",
        "Tuesday: x",
        "Wednesday: x",
        "Thursday: x",
        "Friday: x",
        `Saturday: ${HOURS[(h + i) % 7]}`,
        `Sunday: ${HOURS[(h + i + 2) % 7]}`,
      ],
    },
    editorialSummary: { text: `Locals love this ${kind.replace(/^best /, "")}` },
  }));
}
function plan(prompt) {
  const cands = JSON.parse(prompt.match(/Use ONLY these ids: (\[.*?\])\n/s)[1]);
  const trip = prompt.match(/Make exactly (\d+) plans, plan k is Day k/);
  if (trip) {
    const used = new Set(),
      cats = ["Breakfast", "Scenic stop", "Lunch", "Walk", "Dinner"];
    return {
      plans: Array.from({ length: +trip[1] }, (_, k) => ({
        title: `Day ${k + 1} · Test day`,
        vibe: "Sights and food",
        stops: cats
          .map((c) => {
            const x = cands.find((y) => y.category === c && !used.has(y.id));
            if (x) used.add(x.id);
            return x;
          })
          .filter(Boolean)
          .map((x, i) => ({
            placeId: x.id,
            reason: "Good spot",
            time: ["09:00", "10:30", "13:00", "15:30", "19:30"][i],
          })),
      })),
    };
  }
  const order = [
    ["Lunch", "Specialty coffee", "Sea view"],
    ["Brunch", "Walk", "Dessert"],
    ["Specialty coffee", "Lunch", "Dinner"],
  ];
  return {
    plans: order.map((cats, k) => ({
      title: `Test plan ${k + 1}`,
      vibe: cats.join(", "),
      stops: cats
        .map(
          (c) =>
            cands.find((x) => x.category === c && x.id.startsWith("g_")) ??
            cands.find((x) => x.category === c) ??
            cands[k],
        )
        .filter(Boolean)
        .map((x, i) => ({
          placeId: x.id,
          reason: x.note.slice(0, 30) || "Good spot",
          time: ["12:30", "15:00", "17:30"][i],
        })),
    })),
  };
}
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("lovable.dev")) throw new Error("Lovable service called: " + u);
  if (u.startsWith("https://places.googleapis.com/v1/places:searchText")) {
    const h = new Headers(init.headers);
    if (h.get("x-goog-api-key") !== "g-test")
      return new Response('{"error":{"code":403,"message":"API key not valid"}}', { status: 403 });
    const b = JSON.parse(init.body);
    if (process.env.MOCK_GOOGLE_FAIL)
      return new Response('{"error":{"code":403,"message":"API key not valid"}}', { status: 403 });
    globalThis.__log.push(b);
    if (b.includedType === "locality")
      return new Response(
        JSON.stringify({
          places: Object.keys(CITIES)
            .filter((n) => n.toLowerCase().startsWith(b.textQuery.toLowerCase().slice(0, 3)))
            .map(city),
        }),
        { status: 200 },
      );
    return new Response(JSON.stringify({ places: places(b.textQuery) }), { status: 200 });
  }
  if (u.startsWith("https://places.googleapis.com/v1/places:searchNearby")) {
    return new Response(JSON.stringify({ places: [city("Riyadh")] }), { status: 200 });
  }
  if (u.startsWith("https://api.anthropic.com/v1/messages")) {
    const h = new Headers(init.headers);
    if (h.get("x-api-key") !== "sk-ant-test" && h.get("authorization") !== "Bearer sk-ant-test")
      return new Response(
        '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
        { status: 401 },
      );
    const b = JSON.parse(init.body);
    const prompt = b.messages.at(-1).content;
    if (b.model !== "claude-opus-5-5" || b.fallbacks !== "default" || !b.output_config?.format)
      throw new Error(
        "unexpected request " + JSON.stringify({ model: b.model, fallbacks: b.fallbacks }),
      );
    const out = prompt.startsWith("Return {") ? { ok: true } : plan(prompt);
    return new Response(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: b.model,
        content: [{ type: "text", text: JSON.stringify(out) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 100 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  if (u.includes("api.firecrawl.dev"))
    return new Response(JSON.stringify({ data: { web: [] } }), { status: 200 });
  return real(url, init);
};
