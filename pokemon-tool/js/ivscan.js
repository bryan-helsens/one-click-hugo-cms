/**
 * ivscan.js
 * EXPERIMENTAL reader for the Pokémon GO appraisal screen.
 *
 * The IV stats (Attack / Defense / HP) are drawn as three red bars rather than
 * numbers, so plain text OCR can't read them. This module looks at the pixels:
 * it finds the three horizontal bar rows and, for each, measures how much of the
 * bar is filled (red) versus empty (light track) to estimate a 0–15 value.
 *
 * Screenshots vary a lot across devices, themes and resolutions, so treat the
 * result as a best-effort starting point — the user always confirms/adjusts the
 * values on the clickable bars. Fully robust IV reading is a much larger effort.
 */

const IVScan = {
  MAX_IV: 15,

  /**
   * @param {File|Blob} file
   * @returns {Promise<{atk:number|null, def:number|null, sta:number|null, confidence:number}>}
   */
  async scan(file) {
    const { data, width, height } = await this._loadPixels(file, 540);

    // Per-row counts of "red fill" and "bar" (red OR light track) pixels.
    const redRow = new Array(height).fill(0);
    const barRow = new Array(height).fill(0);
    for (let y = 0; y < height; y++) {
      let red = 0;
      let bar = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (this._isRed(r, g, b)) {
          red++;
          bar++;
        } else if (this._isTrack(r, g, b)) {
          bar++;
        }
      }
      redRow[y] = red;
      barRow[y] = bar;
    }

    // Bar rows are wide horizontal runs; require a decent fraction of the width.
    const minBar = Math.max(20, width * 0.22);
    const bands = this._clusterBands(barRow, minBar);

    // Keep the three strongest bands (most red, top-to-bottom = Atk/Def/HP).
    const ranked = bands
      .map((band) => ({ band, score: this._bandRed(redRow, band) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.band)
      .sort((a, b) => a.center - b.center);

    if (ranked.length < 3) {
      return { atk: null, def: null, sta: null, confidence: 0 };
    }

    const vals = ranked.map((band) => this._measureBar(data, width, band));
    const confidence = vals.every((v) => v != null) ? 0.6 : 0.3;
    return {
      atk: vals[0],
      def: vals[1],
      sta: vals[2],
      confidence
    };
  },

  /** Measure one bar row: filled-red width / (filled + empty-track) width. */
  _measureBar(data, width, band) {
    const y = band.center;
    let firstBar = -1;
    let lastBar = -1;
    let filled = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const isRed = this._isRed(r, g, b);
      const isTrack = this._isTrack(r, g, b);
      if (isRed || isTrack) {
        if (firstBar === -1) firstBar = x;
        lastBar = x;
        if (isRed) filled++;
      }
    }
    const total = lastBar - firstBar + 1;
    if (total <= 0) return null;
    const ratio = Math.min(1, filled / total);
    return Math.max(0, Math.min(this.MAX_IV, Math.round(ratio * this.MAX_IV)));
  },

  /** Group consecutive qualifying rows into bands; return their center rows. */
  _clusterBands(barRow, minBar) {
    const bands = [];
    let start = -1;
    for (let y = 0; y < barRow.length; y++) {
      const ok = barRow[y] >= minBar;
      if (ok && start === -1) start = y;
      if ((!ok || y === barRow.length - 1) && start !== -1) {
        const end = ok ? y : y - 1;
        if (end - start >= 1) {
          bands.push({ start, end, center: Math.floor((start + end) / 2) });
        }
        start = -1;
      }
    }
    return bands;
  },

  _bandRed(redRow, band) {
    let sum = 0;
    for (let y = band.start; y <= band.end; y++) sum += redRow[y];
    return sum;
  },

  /** The appraisal fill is a red/salmon; be tolerant of the gradient. */
  _isRed(r, g, b) {
    return r > 150 && r - g > 45 && r - b > 45;
  },

  /** The empty part of the bar is a light, near-neutral track. */
  _isTrack(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max > 195 && max - min < 32;
  },

  /** Draw the image to a canvas (capped width) and return its pixel data. */
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
