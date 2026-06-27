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
2. **Track your collection** — tag Pokémon as ✨ Shiny, 🍀 Lucky, 🌑 Shadow,
   👑 Legendary, or ⭐ Favorite. Recognised legendaries are auto-tagged.
3. **Search, filter & sort** — by name, notes, tag, CP, or date added.
4. **Transfer advice** — duplicates of the same species are detected, and the
   weaker copies (that aren't favorited/shiny/lucky/shadow/legendary) are
   flagged as transfer candidates so you keep your best and clean out the rest.
5. **Backup** — Export/Import your whole inventory as JSON to back it up or move
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

## Known limits (and the planned v2)

- OCR reliably reads **name, CP and HP** (plain text). The **IV stats**
  (Attack / Defense / HP) are shown in-game as *bars*, not numbers, so they need
  image analysis rather than text OCR — that's the planned **v2**.
- The bundled Pokédex covers **Gen 1–2 names** for autocomplete/matching plus a
  cross-generation **legendary** list. Add later gens to
  `js/pokedex.js → POKEDEX_NAMES` to extend it.
- OCR quality depends on the screenshot. Clear, uncropped detail-screen shots
  work best; you can always correct any field before saving.

## Project layout

```
pokemon-tool/
├── index.html        # markup + CDN script tags
├── css/styles.css    # styling (dark, Pokémon-themed)
└── js/
    ├── pokedex.js    # name dataset, fuzzy matching, legendary set
    ├── storage.js    # localStorage persistence + export/import
    ├── ocr.js        # Tesseract.js OCR + field parsing
    └── app.js        # UI, rendering, inventory logic
```

> Not affiliated with Niantic, Scopely, or The Pokémon Company. Pokémon and
> Pokémon GO are trademarks of their respective owners.
