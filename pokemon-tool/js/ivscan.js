/**
 * ivscan.js
 * EXPERIMENTAL reader for the Pokémon GO appraisal screen.
 *
 * The IV stats (Attack / Defense / HP) are drawn as three red bars rather than
 * numbers, so plain text OCR can't read them. This module looks at the pixels:
 * it locates the three horizontal bars and, for each, measures how much is
 * filled (red) versus empty (light track) to estimate a 0–15 value.
 *
 * Hardening vs. a naive RGB threshold:
 *  - Detection works in HSV, so a saturated team-colour background (blue/yellow,
 *    and mostly red/Valor) isn't mistaken for the red fill.
 *  - Bars are found by their solid horizontal *track* (fill + empty together),
 *    so even a near-empty low-IV bar is located.
 *  - We only accept a triplet of bars that are evenly spaced and share the same
 *    left edge and length — this rejects stray red UI and validates the read.
 *  - Each bar's fill is averaged over several rows for stability.
 *
 * Screenshots still vary a lot, so the result is a best-effort starting point —
 * the user confirms/adjusts on the clickable bars. `confidence` (0–1) reflects
 * how well the detected bars matched the expected geometry.
 */

const IVScan = {
  MAX_IV: 15,

  async scan(file) {
    const { data, width, height } = await this._loadPixels(file, 560);

    // Classify every pixel once: 0 = other, 1 = red fill, 2 = light track.
    const kind = new Uint8Array(width * height);
    let redTotal = 0;
    for (let i = 0, p = 0; p < width * height; p++, i += 4) {
      const k = this._classify(data[i], data[i + 1], data[i + 2]);
      kind[p] = k;
      if (k === 1) redTotal++;
    }
    const redFraction = redTotal / (width * height);

    // Per row: longest run of "bar" pixels (red OR track), bridging the small
    // antialiased gaps at the red/track boundary so a partly-filled bar stays
    // one run rather than splitting into separate red and track segments.
    const minRun = Math.max(40, Math.round(width * 0.28));
    const gapTol = Math.max(3, Math.round(width * 0.012));
    const rows = [];
    for (let y = 0; y < height; y++) {
      const run = this._longestBarRun(kind, width, y, gapTol);
      if (run.len >= minRun) rows.push({ y, ...run });
    }
    if (!rows.length) return this._empty();

    // Group consecutive qualifying rows into horizontal bands, and drop bands
    // too thin to be a real stat bar (e.g. a card's antialiased edge).
    const bands = this._groupBands(rows).filter((b) => b.rows >= 6);
    if (bands.length < 3) return this._empty();

    // Keep bar-like bands (close to the widest run) and pick the best triplet.
    const triplet = this._pickTriplet(bands, width);
    if (!triplet) return this._empty();

    // Shared geometry: all three tracks start/end at the same x.
    const left = this._median(triplet.map((b) => b.start));
    const right = this._median(triplet.map((b) => b.end));
    const span = right - left + 1;
    if (span < minRun) return this._empty();

    const ordered = triplet.slice().sort((a, b) => a.y - b.y);
    const vals = ordered.map((b) => this._measureFill(kind, width, height, b.y, left, right, span));

    // Confidence: geometry consistency, minus a penalty for a very red image.
    const leftSpread = this._spread(triplet.map((b) => b.start)) / span;
    const widthSpread =
      this._spread(triplet.map((b) => b.end - b.start)) / span;
    let confidence = 0.85 - leftSpread * 1.5 - widthSpread * 1.5;
    if (redFraction > 0.33) confidence -= 0.25; // likely a red/Valor background
    confidence = Math.max(0, Math.min(1, confidence));

    return { atk: vals[0], def: vals[1], sta: vals[2], confidence: Number(confidence.toFixed(2)) };
  },

  /** Measure one bar: red pixels within [left,right], averaged over nearby rows. */
  _measureFill(kind, width, height, centerY, left, right, span) {
    const ratios = [];
    for (let dy = -2; dy <= 2; dy++) {
      const y = centerY + dy;
      if (y < 0 || y >= height) continue;
      let red = 0;
      for (let x = left; x <= right; x++) {
        if (kind[y * width + x] === 1) red++;
      }
      ratios.push(red / span);
    }
    if (!ratios.length) return null;
    const ratio = this._median(ratios);
    return Math.max(0, Math.min(this.MAX_IV, Math.round(ratio * this.MAX_IV)));
  },

  /**
   * Longest run of bar pixels (red||track) in a row, with its x extent.
   * Up to `gapTol` consecutive non-bar pixels are tolerated inside a run so
   * antialiased fill/track boundaries don't split one bar into two.
   */
  _longestBarRun(kind, width, y, gapTol = 0) {
    let best = { len: 0, start: 0, end: 0 };
    let start = -1;
    let lastBar = -1;
    let gap = 0;
    const base = y * width;
    for (let x = 0; x < width; x++) {
      if (kind[base + x] !== 0) {
        if (start === -1) start = x;
        lastBar = x;
        gap = 0;
      } else if (start !== -1) {
        if (++gap > gapTol) {
          const len = lastBar - start + 1;
          if (len > best.len) best = { len, start, end: lastBar };
          start = -1;
          gap = 0;
        }
      }
    }
    if (start !== -1) {
      const len = lastBar - start + 1;
      if (len > best.len) best = { len, start, end: lastBar };
    }
    return best;
  },

  /** Merge vertically adjacent qualifying rows into bands (median geometry). */
  _groupBands(rows) {
    const bands = [];
    let group = [rows[0]];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].y - rows[i - 1].y <= 2) {
        group.push(rows[i]);
      } else {
        bands.push(this._bandOf(group));
        group = [rows[i]];
      }
    }
    bands.push(this._bandOf(group));
    return bands;
  },

  _bandOf(group) {
    return {
      y: Math.round(this._median(group.map((r) => r.y))),
      start: Math.round(this._median(group.map((r) => r.start))),
      end: Math.round(this._median(group.map((r) => r.end))),
      len: this._median(group.map((r) => r.len)),
      rows: group.length
    };
  },

  /**
   * Choose three bands that look like the appraisal bars: near-maximal width,
   * shared left edge, and roughly even vertical spacing.
   */
  _pickTriplet(bands, width) {
    if (bands.length < 3) return null;
    const maxLen = Math.max(...bands.map((b) => b.len));
    // Candidates: within 18% of the widest bar (the three tracks are equal).
    const cand = bands.filter((b) => b.len >= maxLen * 0.82);
    if (cand.length < 3) return null;
    if (cand.length === 3) return cand;

    // More than three: score each consecutive triplet by even spacing + aligned
    // left edges, and keep the best.
    cand.sort((a, b) => a.y - b.y);
    let best = null;
    for (let i = 0; i + 2 < cand.length; i++) {
      const t = [cand[i], cand[i + 1], cand[i + 2]];
      const g1 = t[1].y - t[0].y;
      const g2 = t[2].y - t[1].y;
      const evenness = Math.abs(g1 - g2) / Math.max(g1, g2, 1);
      const leftSpread = this._spread(t.map((b) => b.start)) / width;
      const score = evenness + leftSpread;
      if (!best || score < best.score) best = { score, t };
    }
    return best ? best.t : null;
  },

  /** HSV classification: 1 = red fill, 2 = light empty track, 0 = other. */
  _classify(r, g, b) {
    const { h, s, v } = this._hsv(r, g, b);
    // Bright, saturated red/salmon — the filled portion of the bar.
    if ((h <= 18 || h >= 345) && s >= 0.45 && v >= 0.55) return 1;
    // Mid-light grey, low-saturation — the empty track behind the fill.
    // Capped below near-white so a white card background isn't mistaken for it.
    if (v >= 0.62 && v <= 0.93 && s <= 0.16) return 2;
    return 0;
  },

  _hsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
  },

  _median(arr) {
    const a = arr.slice().sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  },

  _spread(arr) {
    return Math.max(...arr) - Math.min(...arr);
  },

  _empty() {
    return { atk: null, def: null, sta: null, confidence: 0 };
  },

  _loadPixels(file, maxWidth) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve({ data: ctx.getImageData(0, 0, w, h).data, width: w, height: h });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Couldn't load that image."));
      };
      img.src = url;
    });
  }
};
