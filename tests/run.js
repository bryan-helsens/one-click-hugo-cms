/**
 * tests/run.js — framework-free test runner for the PokéInventory web logic.
 *
 *   node tests/run.js
 *
 * The web app has no build step: its classic <script> files share one global
 * lexical scope in the browser. To mirror that in Node we concatenate the
 * source modules + the assertions into a single script and run it in one VM
 * context, so the tests can reference OCR / Logic / matchPokedexName directly —
 * i.e. we test the real shipped code, not a copy.
 *
 * Pixel-based IV reading (ivscan.js) needs a canvas, so it is covered by the
 * browser (Playwright) checks, not this Node harness.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const TOOL = path.join(__dirname, "..", "pokemon-tool");
const read = (f) => fs.readFileSync(path.join(TOOL, f), "utf8");

const harness = `
  var __pass = 0, __fail = 0, __failures = [];
  function test(name, fn) {
    try { fn(); __pass++; }
    catch (e) { __fail++; __failures.push(name + " — " + (e && e.message)); }
  }
`;

const combined =
  harness +
  "\n;" + read("js/pokedex.js") +
  "\n;" + read("js/ocr.js") +
  "\n;" + read("js/logic.js") +
  "\n;" + fs.readFileSync(path.join(__dirname, "cases.js"), "utf8") +
  "\n; globalThis.__result = { pass: __pass, fail: __fail, failures: __failures };";

const ctx = { console, assert };
vm.createContext(ctx);
vm.runInContext(combined, ctx, { filename: "pokeinventory-tests.js" });

const r = ctx.__result;
if (r.fail) {
  console.error("\nFAILURES:");
  r.failures.forEach((f) => console.error("  ✗ " + f));
}
console.log(`\n${r.pass} passed, ${r.fail} failed`);
process.exit(r.fail ? 1 : 0);
