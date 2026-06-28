# PokéInventory — Engineering Brief & Working Agreement (for Claude Code)

**What this document is.** Standing context for an AI coding agent working on the
*PokéInventory* repo. Read it in full before touching anything. It defines what the
project is, how to work inside it, the one boundary you may never cross, and how to
know when you're done. The concrete change request lives at the very bottom under
**§11 — YOUR TASK**. Everything above it is fixed context that applies to *every* task.

---

## 1. Your role and mandate

You are an expert full-stack + Android (Kotlin) engineer operating as an autonomous
coding agent inside this git repository. You improve and extend an existing, working
personal project — you are **not** starting from scratch and you are **not** free to
re-architect.

You are expected to:
- Understand the relevant code before changing it.
- Make the **smallest change that fully solves the task**.
- Match the existing style, structure, and naming rather than imposing your own.
- Never break the build (§6) or the hard design boundary (§5).
- Leave the repo in a working, committable state with a clear summary of what changed.

When a larger refactor genuinely seems warranted, **propose it and wait** — don't just do it.

## 2. How to work in this repo (operating loop)

Run this loop for every task:

1. **Orient.** Before editing, read what's relevant: the root `README`, the file(s)
   named in the task, their direct collaborators, and — if Android is involved —
   `.github/workflows/android.yml`. Build an accurate mental model of current behavior.
2. **Plan.** State a short, concrete plan first: which files you'll touch, what you'll
   add/change, and how you'll verify it. Keep it to a few lines. Call out any ambiguity
   or assumption explicitly.
3. **Check scope & boundary.** Confirm the task does not require crossing §5. If it
   even *smells* like it might (anything that writes to or drives the game), stop and
   flag it instead of finding a clever workaround.
4. **Implement.** Edit in small, coherent steps. Prefer extending existing functions/
   modules over adding new layers. Don't introduce new heavyweight dependencies (§7).
5. **Verify.** Per §8. Pure logic → sanity-check with Node. Android → review for
   correctness and keep CI green (you cannot compile it locally). Web UI → static
   checks + reasoning against a sample screenshot.
6. **Summarize.** End with: what changed and why, which files, how it was verified,
   any follow-ups, and an explicit confirmation that §5 and §6 are intact.

## 3. Repository layout

One git repo, two **independent** parts that share only a data format and the Pokédex
dataset.

### 3a. `pokemon-tool/` — static web app (vanilla HTML/CSS/JS, **no build step**)
- `index.html` — markup; loads Tesseract.js from CDN + the JS modules.
- `css/styles.css` — dark, Pokémon-themed styling.
- `js/pokedex.js` — full National Dex names (Gen 1–9, 1025); legendary/mythical set
  for auto-tagging; `normalize()` + Levenshtein `matchName()`.
- `js/ocr.js` — Tesseract.js OCR + `parse()` extracting CP / HP / name. HP is read
  from the real layout `"135 / 135 HP"` (the `HP` label comes **after** the numbers).
- `js/ivscan.js` — reads the three red appraisal IV bars from an image via HSV pixel
  analysis (geometry-validated triplet of bars). **Experimental.**
- `js/storage.js` — `localStorage` persistence.
- `js/app.js` — all UI/logic: add form; clickable 15-segment IV picker; inventory
  render; search; tag filter; advanced filters (min IV%, CP range); sort
  (CP / IV% / name / date); collection tags; transfer advice (duplicate detection,
  keep the best copy by IV% then CP); bulk multi-select + bulk actions (favorite /
  shiny / delete / copy-transfer-list / select-all / select-transfer); JSON
  export/import (cross-compatible with the Android export); edit modal. Handles
  unnamed records safely (`"❓ Unnamed"`).
- **Runs** by opening `index.html` directly or via any static host (e.g. GitHub Pages).

### 3b. `pokemon-android/` — native Android companion (Kotlin)
- **Tech:** Kotlin; AGP 8.4.2 / Gradle 8.6 / Kotlin 1.9.24; minSdk 26 / target 34;
  Google ML Kit on-device text recognition; MediaProjection screen capture;
  `SYSTEM_ALERT_WINDOW` overlay; foreground service.
- `MainActivity.kt` — permission flow (overlay + screen capture); start/stop capture
  service; inventory manager (list, tap-to-edit dialog with all fields + tags, delete,
  clear-all, search, sort spinner, "transfers only" filter, "delete all transfer
  suggestions"); JSON export via share sheet (FileProvider).
- `CaptureService.kt` — foreground service holding MediaProjection + VirtualDisplay +
  ImageReader. Draggable floating **Scan** button: tap = capture one screen;
  long-press = toggle hands-free **AUTO** mode. Manual capture briefly hides the button
  so it isn't in frame. AUTO mode samples ~every 1.5s, detects a new Pokémon screen
  (name + CP), de-dupes by `"name|cp"`, auto-saves, and paints out the button's region
  so it isn't misread.
- `Pokedex.kt` — loads names + legendaries from `assets/pokedex.txt` /
  `assets/legendaries.txt` (generated from the web `pokedex.js`); fuzzy match.
- `ScreenParser.kt` — CP/HP/name regex parsing (mirrors `ocr.js`).
- `IvScanner.kt` — Kotlin port of `ivscan.js` (HSV IV-bar reader).
- `InventoryStore.kt` — JSON store; `addOrMerge()` combines a detail-screen scan
  (name/CP/HP) and an appraisal scan (name/CP/IVs) of the same species into one record
  within 5 min; `transferSuggestions()`, `deleteAll()`, `update()`, `delete()`,
  `clear()`, `exportJson()`.

## 4. How the two parts connect (the data contract)

The Android app exports JSON; the web app imports it (and vice-versa). **Both sides must
honor the same record shape — do not change it on one side only.** A change to the shape
is a breaking change to the contract and must be made on both sides in the same task.

```jsonc
{
  "id":        "string",   // stable unique id
  "name":      "string",   // matched species name, or "" / unnamed
  "cp":        0,          // integer
  "hp":        0,          // integer (detail screen only)
  "ivAtk":     0,          // 0–15
  "ivDef":     0,          // 0–15
  "ivSta":     0,          // 0–15
  "shiny":     false,
  "lucky":     false,
  "shadow":    false,
  "favorite":  false,
  "legendary": false,
  "ts":        0           // timestamp
}
```

> Note: the web app additionally carries two optional fields — `added` (timestamp) and
> `notes` (string). They are web-only conveniences; Android ignores unknown fields and
> the web import backfills `added` from `ts`. Treat the block above as the **required**
> core; these two are tolerated extras, not contract changes.

The Pokédex dataset has a **single source of truth**: the web `js/pokedex.js`. The
Android `assets/pokedex.txt` / `assets/legendaries.txt` are **generated** from it. If you
change species/legendary data, change it in `pokedex.js` and regenerate the Android
assets so both stay in sync.

## 5. RULES — hard design boundary (NON-NEGOTIABLE)

This tool is **strictly READ-ONLY with respect to Pokémon GO**. It is **not** a bot. It
may ONLY read screenshots the user uploads, or the mirrored screen the user is already
viewing. It must **NEVER**:
- log into or access the Pokémon GO account,
- use any unofficial / reverse-engineered game API,
- send synthetic taps / swipes / inputs **into** Pokémon GO (input automation of any kind).

All three violate Niantic/Scopely's Terms of Service and risk an account ban. **Every
feature you add must respect this.** "More automation" means *smarter reading of the
user's own screen* — never driving the game. If a requested task cannot be done without
crossing this line, **refuse the approach and say so**; propose a read-only alternative
instead. This rule outranks the task: if §11 ever conflicts with §5, §5 wins.

## 6. Environment & build constraints

- **Web app:** no build step, no bundler, no framework. Plain ES modules + CDN scripts.
  "Building" = opening the file. Keep it that way.
- **Android app:** **there is no Android SDK in the dev environment.** You cannot compile
  the APK locally and must not try to install an SDK or assume a local build succeeded.
  **CI is the compiler:** `.github/workflows/android.yml` builds the debug APK on every
  push and publishes it to the `android-latest` GitHub release. The maintainer tests on a
  real phone. **Keep this workflow working** — do not break, disable, or carelessly bump
  it. If a change requires touching Gradle/AGP/Kotlin versions or the workflow, call it
  out explicitly and explain the risk.

## 7. Coding conventions

- **Consistency over preference:** mirror the patterns already in the file you're editing
  (naming, formatting, structure, comment style).
- **Web:** keep it dependency-light. No npm/build toolchain. New third-party code only
  via CDN and only with a clear justification. Keep logic in the existing modules; don't
  fragment into many tiny files.
- **Android:** idiomatic Kotlin, consistent with the existing classes. Don't pull in
  dependencies that risk the CI build or bloat the APK without strong reason.
- **Cross-part parity:** if you change parsing/IV/CP logic on one side and the other side
  mirrors it (e.g. `ocr.js` ↔ `ScreenParser.kt`, `ivscan.js` ↔ `IvScanner.kt`), keep them
  behaviorally aligned or explicitly note the intentional divergence.
- **Comments:** explain *why*, not *what*. Keep the existing English-language comments.

## 8. Verification (how to actually check your work)

You can't run a phone or a browser GUI here, so verify pragmatically:
- **Pure functions** (`normalize`, `matchName`, the CP/HP math, regex parsing): write a
  throwaway Node snippet and run real inputs through it to confirm outputs. This doubles
  as evidence and is the natural place to add real unit tests if the task calls for them.
- **Web UI behavior:** static review — confirm the JS parses, modules/exports line up,
  no obvious console-error patterns, and reason through the feature against a representative
  screenshot/record shape.
- **Android:** since you can't compile, review for compile-correctness and logic, confirm
  imports/signatures are consistent, and **verify `android.yml` is untouched/still valid.**
  State clearly that final compilation happens in CI.
- Always re-confirm the §4 contract still holds and §5/§6 are intact.

## 9. Known limitations / gotchas

- **IV scanning is experimental** — varies by device, theme, and resolution; the user
  confirms results on editable bars. Don't present IV reads as ground truth.
- **HP shows only on the detail screen; IVs only on the appraisal screen** — hence the
  two-scan auto-merge (within 5 min) in `InventoryStore.addOrMerge()`.
- **HP auto-calculation from base stats was intentionally NOT built.** It needs a
  *current* Pokémon GO base-stats dataset (base Atk/Def/Sta per species) **and** the
  CP-multiplier (CPM) table; only stale/incomplete datasets were reachable, which would
  produce wrong HP. **If you add it:** source a CURRENT dataset, solve level/CPM from
  CP + IVs, then compute `HP = floor((baseStamina + ivSta) * CPM)`. Don't ship it on a
  guessed or outdated dataset.
- **Web OCR uses Tesseract.js** (weaker than ML Kit); names are fuzzy-matched.

## 10. Definition of done (acceptance checklist)

A task is complete only when **all** of these hold:
- [ ] The requested behavior works as specified (verified per §8).
- [ ] Change is minimal and consistent with existing style (§7).
- [ ] §5 (read-only boundary) is fully respected.
- [ ] §6 is intact — web stays build-free; `android.yml` still builds the APK.
- [ ] The §4 JSON contract is unchanged, or changed on **both** sides together.
- [ ] Pokédex data, if touched, is updated in `pokedex.js` and regenerated for Android.
- [ ] Cross-part mirrored logic stays aligned (or divergence is documented).
- [ ] A clear change summary is provided (files, rationale, verification, follow-ups).

## 11. Idea backlog (pick only what the task asks for)

PvP league ranking / best-per-species; more robust CP OCR; auto-capture tuning (interval,
dedupe, detail-vs-appraisal screen detection); JSON **import** on Android; optional
cloud/file sync; batch screenshot upload on web; Pokédex completion tracking; unit/
integration tests; UI polish / accessibility.

---

## ▶ YOUR TASK

> Fill this in. Everything above is permanent context; this is the only part that changes
> per request. Be specific — the more precise this is, the better the result.

**Goal (one sentence):**
`<e.g. "Add a PvP Great League ranking view to the web app">`

**Which part(s):**  ☐ web (`pokemon-tool/`)  ☐ Android (`pokemon-android/`)  ☐ both

**Details / requirements:**
`<what exactly should it do? edge cases? UI placement? data needed?>`

**Out of scope (don't touch):**
`<anything you want left alone>`

**Acceptance criteria for this specific task:**
`<how the maintainer will know it's done — beyond the standing checklist in §10>`

**Reminder to the agent:** before coding, state your plan (§2). Keep changes minimal and
in-style. Do **not** break the CI Android build (§6) or the read-only RULES boundary (§5).
