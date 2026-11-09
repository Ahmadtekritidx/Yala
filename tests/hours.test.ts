import { parseHours, openAt } from "../src/lib/hours.ts";
const cases: [string, number[][]][] = [
  ["9:00 AM – 11:00 PM", [[540, 1380]]],
  ["9:00 AM – 11:00 PM", [[540, 1380]]],
  [
    "12:00 – 3:30 PM, 7:00 – 11:00 PM",
    [
      [720, 930],
      [1140, 1380],
    ],
  ],
  ["11:00 AM – 3:00 PM", [[660, 900]]],
  ["11:00 – 3:00 PM", [[660, 900]]],
  ["6:00 PM – 2:00 AM", [[1080, 1560]]],
  ["Open 24 hours", [[0, 1440]]],
  ["Closed", []],
  ["12:00 PM – 12:00 AM", [[720, 1440]]],
  ["8:00 AM – 12:00 PM", [[480, 720]]],
];
let bad = 0;
for (const [s, exp] of cases) {
  const got = parseHours(s);
  if (JSON.stringify(got) !== JSON.stringify(exp)) {
    bad++;
    console.log("FAIL", s, JSON.stringify(got), "expected", JSON.stringify(exp));
  }
}
console.log(openAt("9:00 AM – 11:00 PM", 22 * 60 + 30, 120) === false ? "ok late" : "FAIL late");
console.log(openAt("Closed", 600, 60) === false ? "ok closed" : "FAIL closed");
console.log(openAt(undefined, 600, 60) ? "ok unknown" : "FAIL unknown");
console.log(bad ? `${bad} failures` : "all parse cases pass");
