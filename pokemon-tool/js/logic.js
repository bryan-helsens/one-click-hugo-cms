/**
 * logic.js
 * Pure, framework-free inventory logic shared by the web app and exercised by
 * the Node test suite (tests/run.js). It is the JS source of truth for the
 * cross-part rules the Android side mirrors (see §7 of CLAUDE.md):
 *   - transfer/dedupe "keep the best copy by IV% then CP"  ↔ InventoryStore.transferSuggestions()
 *   - two-scan merge (detail + appraisal within 5 min)     ↔ InventoryStore.addOrMerge()
 *
 * Loaded as a browser global (`Logic`) after pokedex.js (it uses the global
 * `normalizeName`), and as a CommonJS module in Node tests.
 */
(function (root, factory) {
  const mod = factory();
  root.Logic = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PROTECTED_FLAGS = ["favorite", "shiny", "lucky", "shadow", "legendary"];
  const MERGE_WINDOW_MS = 5 * 60 * 1000;

  /** IV percentage for a record, or null if any IV is unknown. */
  function ivPercent(p) {
    if (p.ivAtk == null || p.ivDef == null || p.ivSta == null) return null;
    return Math.round(((p.ivAtk + p.ivDef + p.ivSta) / 45) * 100);
  }

  /** Same-species ranking: best first by IV% (nulls last), then CP. */
  function compareForKeep(a, b) {
    const ivA = ivPercent(a);
    const ivB = ivPercent(b);
    if (ivA != null && ivB != null && ivA !== ivB) return ivB - ivA;
    if (ivA != null && ivB == null) return -1;
    if (ivA == null && ivB != null) return 1;
    return (b.cp || 0) - (a.cp || 0);
  }

  /**
   * Which records are duplicates, and which are transfer suggestions (the
   * weaker, unprotected copies). Unnamed records are never grouped together.
   * Requires the global `normalizeName` (from pokedex.js).
   */
  function computeFlags(list) {
    const byName = {};
    list.forEach((p) => {
      const key = normalizeName(p.name);
      if (!key) return;
      (byName[key] = byName[key] || []).push(p);
    });

    const dupIds = new Set();
    const transferIds = new Set();
    Object.values(byName).forEach((group) => {
      if (group.length < 2) return;
      group.forEach((p) => dupIds.add(p.id));
      const sorted = [...group].sort(compareForKeep);
      sorted.slice(1).forEach((p) => {
        if (!PROTECTED_FLAGS.some((f) => p[f])) transferIds.add(p.id);
      });
    });
    return { dupIds, transferIds };
  }

  /** Fill a record's null fields from another, OR-ing the boolean tags. */
  function mergeRecords(a, b) {
    return Object.assign({}, a, {
      name: a.name != null ? a.name : b.name,
      cp: a.cp != null ? a.cp : b.cp,
      hp: a.hp != null ? a.hp : b.hp,
      ivAtk: a.ivAtk != null ? a.ivAtk : b.ivAtk,
      ivDef: a.ivDef != null ? a.ivDef : b.ivDef,
      ivSta: a.ivSta != null ? a.ivSta : b.ivSta,
      shiny: !!(a.shiny || b.shiny),
      lucky: !!(a.lucky || b.lucky),
      shadow: !!(a.shadow || b.shadow),
      favorite: !!(a.favorite || b.favorite),
      legendary: !!(a.legendary || b.legendary)
    });
  }

  /** Index of a recent same-species record to merge into, or -1. */
  function findMergeIndex(list, rec, windowMs) {
    const w = windowMs == null ? MERGE_WINDOW_MS : windowMs;
    if (rec.name == null) return -1;
    return list.findIndex(
      (e) =>
        e.name != null &&
        e.name.toLowerCase() === rec.name.toLowerCase() &&
        (e.cp === rec.cp || e.cp == null || rec.cp == null) &&
        rec.ts - e.ts >= 0 &&
        rec.ts - e.ts <= w
    );
  }

  /**
   * Add a scan, merging it into a recent same-species record if one exists
   * (so a detail scan + an appraisal scan become one record). Returns a new
   * list; does not mutate the input. Mirrors InventoryStore.addOrMerge().
   */
  function addOrMerge(list, rec, windowMs) {
    const out = list.slice();
    const idx = findMergeIndex(out, rec, windowMs);
    if (idx >= 0) out[idx] = mergeRecords(out[idx], rec);
    else out.unshift(rec);
    return out;
  }

  /**
   * Classify which Pokémon GO screen a scan came from, to drive the two-scan
   * merge: the appraisal screen shows the IV bars (no HP number); the detail
   * screen shows the HP number (no IV bars).
   * @returns "appraisal" | "detail" | "unknown"
   */
  function classifyScreen(parsed, hasIv) {
    if (hasIv) return "appraisal";
    if (parsed && parsed.hp != null) return "detail";
    if (parsed && parsed.cp != null && parsed.name != null) return "detail";
    return "unknown";
  }

  /**
   * Fold a batch of scans into merged records (detail + appraisal of the same
   * species combine into one). Order-independent: sorts by ts first so the
   * directional addOrMerge window doesn't matter within a batch.
   */
  function mergeBatch(records) {
    const sorted = records.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    let out = [];
    sorted.forEach((r) => {
      out = addOrMerge(out, r, Number.MAX_SAFE_INTEGER);
    });
    return out;
  }

  // National-Dex generation boundaries (cumulative end index), matching the
  // order of POKEDEX_NAMES in pokedex.js.
  const DEX_GENS = [
    { name: "Gen 1", end: 151 }, { name: "Gen 2", end: 251 },
    { name: "Gen 3", end: 386 }, { name: "Gen 4", end: 493 },
    { name: "Gen 5", end: 649 }, { name: "Gen 6", end: 721 },
    { name: "Gen 7", end: 809 }, { name: "Gen 8", end: 905 },
    { name: "Gen 9", end: 1025 }
  ];

  /**
   * Pokédex completion for the current inventory: overall caught/total, a
   * per-generation breakdown, and the list of still-missing species. Uses the
   * global POKEDEX_NAMES (single source of truth) unless `names` is passed.
   */
  function dexStats(inventory, names) {
    const dex = names || (typeof POKEDEX_NAMES !== "undefined" ? POKEDEX_NAMES : []);
    const owned = new Set();
    inventory.forEach((p) => {
      const k = normalizeName(p.name);
      if (k) owned.add(k);
    });
    const dexNorm = dex.map((n) => normalizeName(n));

    let start = 0;
    const gens = DEX_GENS.map((g) => {
      let c = 0;
      for (let i = start; i < g.end && i < dexNorm.length; i++) {
        if (owned.has(dexNorm[i])) c++;
      }
      const out = { name: g.name, total: g.end - start, caught: c };
      start = g.end;
      return out;
    });

    let caught = 0;
    const missing = [];
    dexNorm.forEach((k, i) => {
      if (owned.has(k)) caught++;
      else missing.push(dex[i]);
    });
    return {
      total: dex.length,
      caught,
      percent: dex.length ? Math.round((caught / dex.length) * 100) : 0,
      gens,
      missing
    };
  }

  /** A record worth importing carries a name or any stat. */
  function hasData(p) {
    return !!(
      p &&
      (p.name ||
        p.cp != null ||
        p.hp != null ||
        p.ivAtk != null ||
        p.ivDef != null ||
        p.ivSta != null)
    );
  }

  /**
   * Normalize imported records: drop empty ones, ensure an id and an `added`
   * timestamp (falling back to the Android `ts`). Keeps unnamed scans so they
   * can be fixed in the editor rather than lost. `makeId`/`now` are injected so
   * this stays pure and testable.
   */
  function sanitizeImport(data, makeId, now) {
    if (!Array.isArray(data)) return [];
    return data
      .filter(hasData)
      .map((p) => Object.assign({ id: p.id || makeId(), added: p.added || p.ts || now() }, p));
  }

  return {
    PROTECTED_FLAGS,
    MERGE_WINDOW_MS,
    ivPercent,
    compareForKeep,
    computeFlags,
    mergeRecords,
    findMergeIndex,
    addOrMerge,
    classifyScreen,
    mergeBatch,
    dexStats,
    DEX_GENS,
    hasData,
    sanitizeImport
  };
});
