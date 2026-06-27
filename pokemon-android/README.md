# 📲 PokéInventory Scanner (Android) — design & build guide

A native Android companion to the [web app](../pokemon-tool) that makes capturing
Pokémon **near-automatic**: a floating button sits on top of Pokémon GO, you open
a Pokémon's appraisal screen, tap once, and it reads **name / CP / HP / IVs** and
saves them — no screenshots, no leaving the game.

> **Status: Stage 3 (feature-complete MVP).** A tap over a Pokémon reads
> **name / CP / HP** (OCR) **and the IV bars**, auto-tags legendaries, stores a
> record, and the inventory exports to JSON for the web app.

## Install the prebuilt APK (no Android Studio)

Every push builds the app in CI and publishes the APK to the **`android-latest`
release**. On your phone:

1. Open the repo's **Releases** → **PokéInventory Scanner — latest debug build**.
2. Download **`app-debug.apk`**.
3. Open it; when prompted, allow **install from unknown sources** for your
   browser / file manager.
4. Launch the app and grant the two permissions (overlay + screen capture).

> It's a debug-signed APK (fine for personal sideloading). If your phone warns
> that Play Protect doesn't recognise it, choose "install anyway".

## Why a native app (and what's still not possible)

- The web app can't auto-capture — browsers can't see other apps' screens. A
  native app can, via Android's **MediaProjection** screen-capture API. This is
  exactly how Poke Genie / Calcy IV work, and it's ToS-safe: it only reads what's
  already on your screen, and **you** drive it. It never touches your account or
  any unofficial game API.
- **One tap per Pokémon is the floor.** The box grid doesn't display IVs or HP —
  those only exist on each Pokémon's appraisal screen. So "read my whole box in
  one tap with zero interaction" is impossible for *any* tool without account
  access (which is against ToS and risks a ban). We capture per-Pokémon instead.

## How it will work (target UX)

1. Launch the app once → grant **Display over other apps** and **screen capture**.
2. Tap **Start** → a small floating button appears; open Pokémon GO.
3. Open a Pokémon → **Appraise** so the three IV bars (and CP/HP/name) are visible.
4. Tap the floating button → the app grabs the current frame, reads the fields,
   and saves the Pokémon. A toast confirms what it read.
5. Repeat per Pokémon. Open the app anytime to view / edit / export the inventory
   (JSON, compatible with the web app's import).

## Architecture

| Concern | Choice |
|---|---|
| Language | Kotlin |
| Screen capture | `MediaProjection` + `ImageReader` + `VirtualDisplay` |
| Floating button | Overlay window (`TYPE_APPLICATION_OVERLAY`, `SYSTEM_ALERT_WINDOW`) |
| Background work | Foreground `Service` (`foregroundServiceType="mediaProjection"`) |
| Text OCR (Stage 2) | Google **ML Kit** Text Recognition (on-device, offline, free) |
| IV reading (Stage 3) | Kotlin port of [`ivscan.js`](../pokemon-tool/js/ivscan.js) pixel logic |
| Storage | JSON file in app storage; share-intent export |
| Min / target SDK | 26 / 34 |

```
Pokémon GO on screen
        │  (you tap the floating button)
        ▼
 CaptureService ── MediaProjection ──▶ Bitmap of the current screen
        │                                   │
        │                     Stage 2: ML Kit OCR → name, CP, HP
        │                     Stage 3: IvScanner → Atk/Def/HP IVs
        ▼                                   │
   CaptureStore (JSON)  ◀───────────────────┘
        │
   MainActivity: list · edit · export
```

## Build & run (Android Studio)

You need [Android Studio](https://developer.android.com/studio) (this folder has
no SDK bundled).

1. **Android Studio → Open** → select this `pokemon-android/` folder.
2. Let Gradle sync (it downloads the Android Gradle Plugin + SDK as needed). The
   Gradle **wrapper jar / `gradlew` script aren't committed** (the build sandbox
   couldn't reach `services.gradle.org`) — Android Studio recreates them on first
   sync automatically. The Gradle version is pinned to **8.6** in
   `gradle/wrapper/gradle-wrapper.properties` (matches AGP 8.4.2). If it asks to
   install an SDK platform (API 34), accept.
3. Plug in your phone with **USB debugging** on (Settings → Developer options), or
   use an emulator. Press **Run ▶**.
4. On first launch, grant **Display over other apps** and accept the **screen
   capture** prompt.

To install without a cable: **Build → Build APK**, then transfer
`app/build/outputs/apk/debug/app-debug.apk` to your phone and open it (enable
"install unknown apps" for your file manager).

## Roadmap

- [x] **Stage 1** — overlay button, screen-capture permission, capture frame,
      basic list.
- [x] **Stage 2** — on-device ML Kit OCR of name/CP/HP; fuzzy name-matching
      against the bundled Pokédex (Gen 1–9, shared with the web app); legendary
      auto-tagging; JSON inventory store.
- [x] **Stage 3** — Kotlin IV-bar scanner (port of `ivscan.js`); a tap reads CP/
      HP/name **and** IVs from the same frame; IV% shown in the list; JSON export
      (share sheet) compatible with the web app's import.
- [x] **Manage** — search, sort (CP / IV% / name / newest), a "transfers only"
      filter, tap-to-edit every field, and one-tap **delete all transfer
      suggestions** (weaker duplicates; favorite/shiny/lucky/shadow/legendary
      protected). The web app has the fuller manager (bulk multi-select, IV%/CP
      range filters, copy transfer list).
- [x] **Stage 4 — auto-capture** — long-press the floating button to toggle
      hands-free mode: the app samples the screen (~every 1.5 s), and whenever a
      new Pokémon detail/appraisal screen appears it auto-reads and saves it (de-
      duped by species+CP). You just browse your box and appraise as normal.

> **Auto-capture is read-only and ToS-safe.** It never sends taps or swipes into
> Pokémon GO — *you* navigate the game; the app only looks at what's already on
> screen. Software that taps/scrolls *inside* the game is gameplay automation,
> which violates the ToS and risks an account ban, so it is deliberately not
> built here.

## Honesty notes

- I can't compile or run this from my side (no Android SDK / device here), so
  expect a few build-time fixes as you sync in Android Studio — tell me the errors
  and I'll correct them.
- Not affiliated with Niantic, Scopely, or The Pokémon Company.
