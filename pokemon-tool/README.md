# ⚡ PokéInventory — Pokémon GO Inventory Manager

A lightweight, screenshot-powered inventory manager for **Pokémon GO**. Upload a
screenshot of a Pokémon's detail screen and it reads the **name**, **CP** and
**HP** automatically, then helps you track your collection and decide what to
keep or transfer.

It's a single self-contained web app — **no build step, no server, no login**.
Open `index.html` in any browser (desktop or phone) and you're running.

## How it works

```
Screenshot ──▶ in-browser OCR (Tesseract.js) ──▶ name / CP / HP ──▶ your inventory
                                                                          │
                              search · sort · tags · transfer advice ◀────┘
```

1. **Add a Pokémon** — take a photo / upload a screenshot of the Pokémon detail
   screen. The app runs OCR locally and pre-fills the form. Review the values
   (OCR isn't perfect) and save.
2. **Record IVs** — set Attack / Defense / HP on clickable 15-segment bars (with
   a live IV% readout), or try the **experimental appraisal-screen scanner**
   that reads the red bars from a screenshot and pre-fills them for you.
3. **Track your collection** — tag Pokémon as ✨ Shiny, 🍀 Lucky, 🌑 Shadow,
   👑 Legendary, or ⭐ Favorite. Recognised legendaries are auto-tagged.
4. **Search, filter & sort** — by name/notes, tag, **min IV%**, **CP range**,
   and sort by CP / IV% / name / date.
5. **Bulk actions** — select multiple Pokémon (or "Select all shown" / "Select
   transfer suggestions") and **delete**, **tag** (favorite/shiny), or **copy a
   transfer list** to the clipboard in one go.
6. **Transfer advice** — duplicates of the same species are detected, and the
   weaker copies (that aren't favorited/shiny/lucky/shadow/legendary) are
   flagged as transfer candidates. The *best* copy to keep is chosen by IV%
   first, then CP — so you protect your highest-IV mon and clear out the rest.
7. **Backup** — Export/Import your whole inventory as JSON to back it up or move
   it between devices.

## Running it

It's static files. Any of these work:

```bash
# Option A: just open the file
open pokemon-tool/index.html        # macOS
xdg-open pokemon-tool/index.html    # Linux

# Option B: serve it (recommended — some browsers restrict file:// features)
cd pokemon-tool
python3 -m http.server 8000
# then visit http://localhost:8000
```

On your phone, host the folder somewhere (or use the dev server on your LAN) and
open it in your mobile browser so you can use the camera to capture screens.

## Privacy & fair play

- **Your account is never touched.** The app only reads screenshots *you* upload.
  It does **not** log into Pokémon GO or use any unofficial game API — those
  violate Niantic/Scopely's Terms of Service and risk a ban.
- **Your data stays on your device.** The inventory lives in your browser's
  `localStorage`; the only way data leaves is when *you* press Export.
- OCR runs entirely in your browser. Images are not uploaded anywhere.

## Known limits

- **Text OCR** reliably reads **name, CP and HP** from the detail screen. Quality
  depends on the screenshot — clear, uncropped shots work best, and you can
  always correct any field before saving.
- **IV scanning is experimental.** The IV stats are shown in-game as *bars*, not
  numbers, so the scanner measures the red fill of each bar from an appraisal
  screenshot. Detection runs in HSV and validates the three-bar geometry, so it
  tolerates team-colour backgrounds (blue/yellow, and mostly red/Valor), stray
  red UI, and different resolutions — but screenshots still vary, so always
  confirm the values on the clickable bars (the reliable input). Production-grade
  IV reading (à la Poke Genie) is a much larger, ML-assisted effort.
- The bundled Pokédex covers the **full National Dex, Gen 1–9** (1025 names) plus
  a cross-generation **legendary/mythical** list for auto-tagging.

## Project layout

```
pokemon-tool/
├── index.html        # markup + CDN script tags
├── css/styles.css    # styling (dark, Pokémon-themed)
└── js/
    ├── pokedex.js    # name dataset (Gen 1–9), fuzzy matching, legendary set
    ├── storage.js    # localStorage persistence + export/import
    ├── ocr.js        # Tesseract.js OCR + field parsing (name/CP/HP)
    ├── ivscan.js     # experimental appraisal-bar IV reader (pixel analysis)
    └── app.js        # UI, rendering, IV picker, inventory logic
```

> Not affiliated with Niantic, Scopely, or The Pokémon Company. Pokémon and
> Pokémon GO are trademarks of their respective owners.
