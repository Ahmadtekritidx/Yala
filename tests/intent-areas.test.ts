// A chosen place is recognised however it is written: El Mina and Trablos are Tripoli.
//   node --experimental-strip-types tests/intent-areas.test.ts
import assert from "node:assert/strict";
import { areasIn } from "../src/lib/intent.ts";

assert.deepEqual(areasIn("lunch in mina"), ["Tripoli"]);
assert.deepEqual(areasIn("El-Mina sunset"), ["Tripoli"]);
assert.deepEqual(areasIn("bedna trablos"), ["Tripoli"]);
assert.deepEqual(areasIn("طرابلس"), ["Tripoli"]);
assert.deepEqual(areasIn("batrun w jbeil").sort(), ["Batroun", "Jbeil"]);
assert.deepEqual(areasIn("cinema night"), []); // "mina" inside a word is not El Mina
console.log("intent areas: El Mina, Trablos and spellings map to their area");
