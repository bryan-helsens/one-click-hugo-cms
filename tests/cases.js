/**
 * tests/cases.js — assertions, run inside the shared VM scope by tests/run.js.
 * Has access to: pokedex.js (normalizeName, matchPokedexName, isLegendaryName),
 * ocr.js (OCR), logic.js (Logic), plus `assert` and `test()`.
 */

// ---- Pokédex: normalize + fuzzy matchName ----
test("normalizeName strips punctuation/case", function () {
  assert.strictEqual(normalizeName("Mr. Mime"), "mrmime");
  assert.strictEqual(normalizeName("Farfetch'd"), "farfetchd");
  assert.strictEqual(normalizeName(null), "");
});

test("matchName: exact species", function () {
  const m = matchPokedexName("Charizard");
  assert.strictEqual(m.name, "Charizard");
  assert.strictEqual(m.score, 1);
});

test("matchName: near-miss OCR garble resolves", function () {
  assert.strictEqual(matchPokedexName("Charizrd").name, "Charizard");
  assert.strictEqual(matchPokedexName("Gardevor").name, "Gardevoir");
  assert.strictEqual(matchPokedexName("Tyranitr").name, "Tyranitar");
  assert.strictEqual(matchPokedexName("Meowscarda").name, "Meowscarada");
});

test("matchName: nonsense returns null", function () {
  assert.strictEqual(matchPokedexName("zzqqxx"), null);
  assert.strictEqual(matchPokedexName("ab"), null); // too short
});

test("isLegendary across gens", function () {
  assert.strictEqual(isLegendaryName("Mewtwo"), true);
  assert.strictEqual(isLegendaryName("Koraidon"), true);
  assert.strictEqual(isLegendaryName("Pikachu"), false);
});

// ---- OCR field parsing ----
test("parse: lowercase cp + 'X / Y HP' suffix layout", function () {
  const p = OCR.parse("cp 2654\nJolteon\n135 / 135 HP");
  assert.strictEqual(p.cp, 2654);
  assert.strictEqual(p.hp, 135);
  assert.strictEqual(p.name, "Jolteon");
});

test("parse: CP misread as GP still reads", function () {
  const p = OCR.parse("GP1234\nGengar\n100 / 100 HP");
  assert.strictEqual(p.cp, 1234);
  assert.strictEqual(p.name, "Gengar");
});

test("parse: damaged HP takes the max (total) side", function () {
  assert.strictEqual(OCR.parse("CP 1500\nGyarados\n50 / 180 HP").hp, 180);
});

test("parse: Mega-range CP accepted, absurd CP rejected", function () {
  assert.strictEqual(OCR.parse("CP 8500\nMewtwo\n200 / 200 HP").cp, 8500);
  assert.strictEqual(OCR.parse("CP 12345\nMewtwo\n200 / 200 HP").cp, null);
});

test("parse: no CP / pure noise", function () {
  const a = OCR.parse("Snorlax\n300 / 300 HP");
  assert.strictEqual(a.cp, null);
  assert.strictEqual(a.hp, 300);
  assert.strictEqual(a.name, "Snorlax");
  const b = OCR.parse("POWER UP\nSTARDUST 4000\nWEIGHT 12 kg");
  assert.deepStrictEqual([b.cp, b.hp, b.name], [null, null, null]);
});

// ---- IV% math ----
test("ivPercent: rounding + missing IVs", function () {
  assert.strictEqual(Logic.ivPercent({ ivAtk: 15, ivDef: 15, ivSta: 15 }), 100);
  assert.strictEqual(Logic.ivPercent({ ivAtk: 15, ivDef: 14, ivSta: 15 }), 98);
  assert.strictEqual(Logic.ivPercent({ ivAtk: 10, ivDef: 10, ivSta: 10 }), 67);
  assert.strictEqual(Logic.ivPercent({ ivAtk: 0, ivDef: 0, ivSta: 0 }), 0);
  assert.strictEqual(Logic.ivPercent({ ivAtk: null, ivDef: 5, ivSta: 5 }), null);
});

// ---- Transfer / dedupe: keep best by IV% then CP ----
function rec(o) {
  return Object.assign(
    { id: "?", name: null, cp: null, hp: null, ivAtk: null, ivDef: null,
      ivSta: null, shiny: false, lucky: false, shadow: false, favorite: false,
      legendary: false, ts: 0 },
    o
  );
}

test("transfer: weaker duplicate flagged, best kept", function () {
  const best = rec({ id: "best", name: "Charizard", cp: 2500, ivAtk: 15, ivDef: 15, ivSta: 15 });
  const weak = rec({ id: "weak", name: "Charizard", cp: 900, ivAtk: 2, ivDef: 3, ivSta: 4 });
  const { dupIds, transferIds } = Logic.computeFlags([best, weak]);
  assert.deepStrictEqual([...dupIds].sort(), ["best", "weak"]);
  assert.deepStrictEqual([...transferIds], ["weak"]);
});

test("transfer: IV% beats CP when choosing the keeper", function () {
  const hiIv = rec({ id: "hiIv", name: "Gyarados", cp: 900, ivAtk: 15, ivDef: 15, ivSta: 15 });
  const hiCp = rec({ id: "hiCp", name: "Gyarados", cp: 3000, ivAtk: 1, ivDef: 1, ivSta: 1 });
  const { transferIds } = Logic.computeFlags([hiCp, hiIv]);
  assert.deepStrictEqual([...transferIds], ["hiCp"]);
});

test("transfer: protected tags are never suggested", function () {
  const best = rec({ id: "best", name: "Lapras", cp: 2500, ivAtk: 15, ivDef: 15, ivSta: 15 });
  const fav = rec({ id: "fav", name: "Lapras", cp: 800, favorite: true });
  assert.deepStrictEqual([...Logic.computeFlags([best, fav]).transferIds], []);
});

test("transfer: unnamed records are not grouped as duplicates", function () {
  const a = rec({ id: "a", name: null, cp: 1500 });
  const b = rec({ id: "b", name: null, cp: 1600 });
  const { dupIds, transferIds } = Logic.computeFlags([a, b]);
  assert.strictEqual(dupIds.size, 0);
  assert.strictEqual(transferIds.size, 0);
});

// ---- Two-scan merge (detail + appraisal) ----
test("mergeRecords: fills nulls, ORs tags", function () {
  const detail = rec({ id: "d", name: "Dratini", cp: 1500, hp: 41, shiny: true });
  const appr = rec({ id: "x", name: "Dratini", cp: 1500, ivAtk: 12, ivDef: 13, ivSta: 14, favorite: true });
  const m = Logic.mergeRecords(detail, appr);
  assert.strictEqual(m.id, "d"); // keeps the original id
  assert.strictEqual(m.hp, 41);
  assert.deepStrictEqual([m.ivAtk, m.ivDef, m.ivSta], [12, 13, 14]);
  assert.strictEqual(m.shiny && m.favorite, true);
});

test("addOrMerge: same species within 5 min merges into one", function () {
  const detail = rec({ id: "d", name: "Dratini", cp: 1500, hp: 41, ts: 1000 });
  const appr = rec({ id: "x", name: "Dratini", cp: 1500, ivAtk: 10, ivDef: 11, ivSta: 12, ts: 1000 + 60000 });
  const out = Logic.addOrMerge([detail], appr);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].hp, 41);
  assert.strictEqual(Logic.ivPercent(out[0]), Logic.ivPercent(appr));
});

test("addOrMerge: outside the 5-min window does NOT merge", function () {
  const detail = rec({ id: "d", name: "Dratini", cp: 1500, hp: 41, ts: 1000 });
  const late = rec({ id: "x", name: "Dratini", cp: 1500, ivAtk: 10, ivDef: 11, ivSta: 12, ts: 1000 + 6 * 60000 });
  assert.strictEqual(Logic.addOrMerge([detail], late).length, 2);
});

test("addOrMerge: different species stays separate; cp-null still merges", function () {
  const a = rec({ id: "a", name: "Dratini", cp: 1500, hp: 41, ts: 1000 });
  const other = rec({ id: "b", name: "Magikarp", cp: 120, ts: 1000 });
  assert.strictEqual(Logic.addOrMerge([a], other).length, 2);
  const apprNoCp = rec({ id: "c", name: "Dratini", cp: null, ivAtk: 9, ivDef: 9, ivSta: 9, ts: 1000 });
  const merged = Logic.addOrMerge([a], apprNoCp);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].cp, 1500);
});

// ---- Import sanitize + export→import round-trip parity ----
test("sanitizeImport: keeps unnamed scans, drops empties, backfills id/added", function () {
  const out = Logic.sanitizeImport(
    [{ name: null, cp: 1500, ts: 5 }, {}, null, { id: "keep", name: "Mew", added: 7, ts: 9 }],
    () => "gen",
    () => 99
  );
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].id, "gen");
  assert.strictEqual(out[0].added, 5); // from ts
  assert.strictEqual(out[1].id, "keep");
  assert.strictEqual(out[1].added, 7); // existing wins
  assert.deepStrictEqual(Logic.sanitizeImport("nope", () => "x", () => 0), []);
});

test("round-trip: web export -> JSON -> import preserves the core contract", function () {
  const original = rec({
    id: "r1", name: "Charizard", cp: 2500, hp: 152,
    ivAtk: 15, ivDef: 14, ivSta: 15, shiny: true, legendary: false, ts: 1234,
    added: 1234, notes: "best"
  });
  const roundTripped = Logic.sanitizeImport(
    JSON.parse(JSON.stringify([original])), () => "new", () => 0
  )[0];
  ["id", "name", "cp", "hp", "ivAtk", "ivDef", "ivSta",
   "shiny", "lucky", "shadow", "favorite", "legendary", "ts"].forEach((k) => {
    assert.deepStrictEqual(roundTripped[k], original[k], "field " + k);
  });
});

// ---- Screen-type classification + batch merge (Part C) ----
test("classifyScreen: detail vs appraisal vs unknown", function () {
  assert.strictEqual(Logic.classifyScreen({ name: "Charizard", cp: 2500, hp: 152 }, false), "detail");
  assert.strictEqual(Logic.classifyScreen({ name: "Charizard", cp: 2500, hp: null }, true), "appraisal");
  assert.strictEqual(Logic.classifyScreen({ name: "Charizard", cp: 2500, hp: null }, false), "detail");
  assert.strictEqual(Logic.classifyScreen({ name: null, cp: null, hp: null }, false), "unknown");
});

test("mergeBatch: detail + appraisal of same species merge; order-independent", function () {
  const detail = rec({ id: "d", name: "Dratini", cp: 1500, hp: 41, ts: 30 });
  const appr = rec({ id: "x", name: "Dratini", cp: 1500, ivAtk: 12, ivDef: 13, ivSta: 14, ts: 10 });
  const karp = rec({ id: "k", name: "Magikarp", cp: 120, ts: 20 });
  const out = Logic.mergeBatch([detail, appr, karp]); // intentionally out of ts order
  assert.strictEqual(out.length, 2);
  const dr = out.find((r) => r.name === "Dratini");
  assert.strictEqual(dr.hp, 41);
  assert.strictEqual(Logic.ivPercent(dr), Logic.ivPercent(appr));
});

test("parse: appraisal IV-bar labels are not mistaken for a name", function () {
  const p = OCR.parse("CP 2500\nCharizard\nATTACK\nDEFENSE\nHP");
  assert.strictEqual(p.name, "Charizard");
  assert.strictEqual(p.cp, 2500);
  assert.strictEqual(p.hp, null); // appraisal screen has no HP number
});

test("round-trip: Android-shape record (no added/notes) imports cleanly", function () {
  const android = { id: "a1", name: "Slaking", cp: 3409, hp: 207,
    ivAtk: 13, ivDef: 14, ivSta: 12, shiny: false, lucky: false, shadow: false,
    favorite: false, legendary: false, ts: 555 };
  const imported = Logic.sanitizeImport([android], () => "x", () => 1000)[0];
  assert.strictEqual(imported.added, 555); // backfilled from ts
  assert.strictEqual(imported.cp, 3409);
  assert.strictEqual(Logic.ivPercent(imported), Logic.ivPercent(android));
});
