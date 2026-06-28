/**
 * ocr.js
 * In-browser OCR of Pokémon GO screenshots using Tesseract.js.
 *
 * It reads the raw text off the image and then parses out the fields we can
 * extract reliably: CP, HP and the species name. The IV "bars" shown on the
 * appraisal screen are NOT numbers, so they can't be read by plain OCR — those
 * are left for the user to fill in (or a future v2 with image analysis).
 */

const OCR = {
  /**
   * Run OCR on an image File/Blob.
   * @param {File|Blob} file
   * @param {(progress:number)=>void} onProgress 0..1
   * @returns {Promise<{ raw:string, parsed:object }>}
   */
  async readImage(file, onProgress) {
    if (typeof Tesseract === "undefined") {
      throw new Error(
        "OCR engine didn't load (are you offline?). You can still enter Pokémon manually."
      );
    }

    const result = await Tesseract.recognize(file, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text" && typeof onProgress === "function") {
          onProgress(m.progress);
        }
      }
    });

    const raw = result.data.text || "";
    return { raw, parsed: this.parse(raw) };
  },

  /**
   * Parse fields out of raw OCR text.
   * @returns {{ name:string|null, nameScore:number, cp:number|null, hp:number|null }}
   */
  parse(raw) {
    const text = raw.replace(/\r/g, "");
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    return {
      cp: this.parseCP(text),
      hp: this.parseHP(text),
      ...this.parseName(lines)
    };
  },

  /** CP appears at the very top, e.g. "CP 1234" / "CP1234" / "cp 1234". */
  parseCP(text) {
    // OCR sometimes reads CP as "GP", "OP", "CR" — be a little forgiving.
    const m = text.match(/\b[CGO][PR]\s*[:.]?\s*(\d{2,5})\b/i);
    if (m) {
      const cp = parseInt(m[1], 10);
      if (cp >= 10 && cp <= 9000) return cp; // headroom for Mega/Primal
    }
    return null;
  },

  /**
   * HP on the detail screen reads "135 / 135 HP" — the label comes AFTER the
   * numbers — so anchor on that first, then fall back to looser patterns.
   */
  parseHP(text) {
    const ok = (n) => Number.isFinite(n) && n >= 1 && n <= 600;

    // "135 / 135 HP" — the real GO layout; take the max (total) side.
    const suffix = text.match(/(\d{1,3})\s*\/\s*(\d{1,3})\s*HP/i);
    if (suffix && ok(parseInt(suffix[2], 10))) return parseInt(suffix[2], 10);

    // Reverse order "HP 135 / 135".
    const labeled = text.match(/HP[^0-9]{0,4}(\d{1,3})\s*\/\s*(\d{1,3})/i);
    if (labeled && ok(parseInt(labeled[2], 10))) return parseInt(labeled[2], 10);

    // Any "n / n" pair where both sides match (full health).
    const pairs = [...text.matchAll(/(\d{1,3})\s*\/\s*(\d{1,3})/g)];
    for (const p of pairs) {
      const a = parseInt(p[1], 10);
      const b = parseInt(p[2], 10);
      if (a === b && ok(b)) return b;
    }
    // "135 HP" with the slash dropped by OCR.
    const single = text.match(/(\d{1,3})\s*HP/i);
    if (single && ok(parseInt(single[1], 10))) return parseInt(single[1], 10);

    // Fall back to the max side of the first plausible pair.
    if (pairs.length && ok(parseInt(pairs[0][2], 10))) return parseInt(pairs[0][2], 10);
    return null;
  },

  /**
   * The species name is large text near the top, under the CP. We fuzzy-match
   * each candidate line against the Pokédex and keep the best scorer.
   */
  parseName(lines) {
    let best = null;
    for (const line of lines) {
      // Skip lines that are clearly stats/labels — including the appraisal
      // screen's IV-bar labels (ATTACK / DEFENSE / HP / STAMINA), so they're
      // never mistaken for a species name.
      if (/\bCP\b/i.test(line) || /\d\s*\/\s*\d/.test(line)) continue;
      if (/\b(kg|m|WEIGHT|HEIGHT|POWER|UP|STARDUST|ATTACK|DEFENSE|DEFENCE|STAMINA|HP)\b/i.test(line)) continue;

      // A name line may contain extra tokens; try the whole line and each word.
      const candidates = [line, ...line.split(/\s+/)];
      for (const c of candidates) {
        const match = matchPokedexName(c);
        if (match && (!best || match.score > best.score)) {
          best = match;
        }
      }
    }
    return best
      ? { name: best.name, nameScore: best.score }
      : { name: null, nameScore: 0 };
  }
};
