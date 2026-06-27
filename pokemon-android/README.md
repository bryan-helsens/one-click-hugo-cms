# 📲 PokéInventory Scanner (Android) — design & build guide

A native Android companion to the [web app](../pokemon-tool) that makes capturing
Pokémon **near-automatic**: a floating button sits on top of Pokémon GO, you open
a Pokémon's appraisal screen, tap once, and it reads **name / CP / HP / IVs** and
saves them — no screenshots, no leaving the game.

> **Status: Stage 2.** Platform plumbing (overlay + screen capture) plus
> on-device OCR — a tap reads **name / CP / HP** and stores a record. IV reading
> (the red bars) lands in Stage 3. See the roadmap below.

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
   sync automatically. The Gradle version is pinned to **8.7** in
   `gradle/wrapper/gradle-wrapper.properties` (matches AGP 8.5.2). If it asks to
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
- [ ] **Stage 3** — Kotlin IV-bar scanner (port of `ivscan.js`), IV display, and
      JSON export/import compatible with the web app.
- [ ] **Stage 4 (maybe)** — auto-detect the appraisal screen so it captures
      without a tap as you flip through Pokémon.

## Honesty notes

- I can't compile or run this from my side (no Android SDK / device here), so
  expect a few build-time fixes as you sync in Android Studio — tell me the errors
  and I'll correct them.
- Not affiliated with Niantic, Scopely, or The Pokémon Company.
