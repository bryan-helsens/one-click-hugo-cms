package com.pokeinventory.scanner

import android.graphics.Bitmap
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Kotlin port of the web app's ivscan.js — reads the three red appraisal bars
 * from a captured frame and estimates each 0–15 IV.
 *
 * Detection runs in HSV (so team-colour backgrounds aren't read as fill), finds
 * bars by their solid horizontal track (so near-empty bars are still located),
 * validates a triplet of evenly-spaced equal-length bars, and averages each
 * bar's fill over several rows. Best-effort: the user confirms on screen.
 */
object IvScanner {

    private const val MAX_IV = 15

    data class IvResult(val atk: Int?, val def: Int?, val sta: Int?, val confidence: Double) {
        val complete get() = atk != null && def != null && sta != null
    }

    private val EMPTY = IvResult(null, null, null, 0.0)

    fun scan(source: Bitmap, maxWidth: Int = 560): IvResult {
        val scale = min(1.0, maxWidth.toDouble() / source.width)
        val w = max(1, (source.width * scale).roundToInt())
        val h = max(1, (source.height * scale).roundToInt())
        val scaled = Bitmap.createScaledBitmap(source, w, h, true)
        val pixels = IntArray(w * h)
        scaled.getPixels(pixels, 0, w, 0, 0, w, h)
        if (scaled != source) scaled.recycle()

        // Classify pixels: 0 = other, 1 = red fill, 2 = light track.
        val kind = IntArray(w * h)
        var redTotal = 0
        for (i in pixels.indices) {
            val p = pixels[i]
            val k = classify((p ushr 16) and 0xff, (p ushr 8) and 0xff, p and 0xff)
            kind[i] = k
            if (k == 1) redTotal++
        }
        val redFraction = redTotal.toDouble() / (w * h)

        val minRun = max(40, (w * 0.28).roundToInt())
        val gapTol = max(3, (w * 0.012).roundToInt())
        val rows = ArrayList<Band>()
        for (y in 0 until h) {
            val run = longestBarRun(kind, w, y, gapTol)
            if (run.len >= minRun) rows.add(Band(y, run.start, run.end, run.len, 1))
        }
        if (rows.isEmpty()) return EMPTY

        val bands = groupBands(rows).filter { it.rows >= 6 }
        if (bands.size < 3) return EMPTY

        val triplet = pickTriplet(bands, w) ?: return EMPTY
        val left = median(triplet.map { it.start.toDouble() }).roundToInt()
        val right = median(triplet.map { it.end.toDouble() }).roundToInt()
        val span = right - left + 1
        if (span < minRun) return EMPTY

        val ordered = triplet.sortedBy { it.y }
        val vals = ordered.map { measureFill(kind, w, h, it.y, left, right, span) }

        val leftSpread = spread(triplet.map { it.start.toDouble() }) / span
        val widthSpread = spread(triplet.map { (it.end - it.start).toDouble() }) / span
        var confidence = 0.85 - leftSpread * 1.5 - widthSpread * 1.5
        if (redFraction > 0.33) confidence -= 0.25
        confidence = max(0.0, min(1.0, confidence))

        return IvResult(vals[0], vals[1], vals[2], (confidence * 100).roundToInt() / 100.0)
    }

    private data class Band(val y: Int, val start: Int, val end: Int, val len: Int, val rows: Int)
    private data class Run(val len: Int, val start: Int, val end: Int)

    private fun measureFill(
        kind: IntArray, w: Int, h: Int, centerY: Int, left: Int, right: Int, span: Int
    ): Int? {
        val ratios = ArrayList<Double>()
        for (dy in -2..2) {
            val y = centerY + dy
            if (y < 0 || y >= h) continue
            var red = 0
            val base = y * w
            for (x in left..right) if (kind[base + x] == 1) red++
            ratios.add(red.toDouble() / span)
        }
        if (ratios.isEmpty()) return null
        val ratio = median(ratios)
        return max(0, min(MAX_IV, (ratio * MAX_IV).roundToInt()))
    }

    private fun longestBarRun(kind: IntArray, w: Int, y: Int, gapTol: Int): Run {
        var best = Run(0, 0, 0)
        var start = -1
        var lastBar = -1
        var gap = 0
        val base = y * w
        for (x in 0 until w) {
            if (kind[base + x] != 0) {
                if (start == -1) start = x
                lastBar = x
                gap = 0
            } else if (start != -1) {
                if (++gap > gapTol) {
                    val len = lastBar - start + 1
                    if (len > best.len) best = Run(len, start, lastBar)
                    start = -1
                    gap = 0
                }
            }
        }
        if (start != -1) {
            val len = lastBar - start + 1
            if (len > best.len) best = Run(len, start, lastBar)
        }
        return best
    }

    private fun groupBands(rows: List<Band>): List<Band> {
        val bands = ArrayList<Band>()
        var group = ArrayList<Band>().apply { add(rows[0]) }
        for (i in 1 until rows.size) {
            if (rows[i].y - rows[i - 1].y <= 2) {
                group.add(rows[i])
            } else {
                bands.add(bandOf(group))
                group = ArrayList<Band>().apply { add(rows[i]) }
            }
        }
        bands.add(bandOf(group))
        return bands
    }

    private fun bandOf(group: List<Band>): Band = Band(
        y = median(group.map { it.y.toDouble() }).roundToInt(),
        start = median(group.map { it.start.toDouble() }).roundToInt(),
        end = median(group.map { it.end.toDouble() }).roundToInt(),
        len = median(group.map { it.len.toDouble() }).roundToInt(),
        rows = group.size
    )

    private fun pickTriplet(bands: List<Band>, width: Int): List<Band>? {
        if (bands.size < 3) return null
        val maxLen = bands.maxOf { it.len }
        val cand = bands.filter { it.len >= maxLen * 0.82 }
        if (cand.size < 3) return null
        if (cand.size == 3) return cand

        val sorted = cand.sortedBy { it.y }
        var best: Pair<Double, List<Band>>? = null
        for (i in 0..sorted.size - 3) {
            val t = listOf(sorted[i], sorted[i + 1], sorted[i + 2])
            val g1 = (t[1].y - t[0].y).toDouble()
            val g2 = (t[2].y - t[1].y).toDouble()
            val evenness = abs(g1 - g2) / max(max(g1, g2), 1.0)
            val leftSpread = spread(t.map { it.start.toDouble() }) / width
            val score = evenness + leftSpread
            if (best == null || score < best.first) best = score to t
        }
        return best?.second
    }

    private fun classify(r: Int, g: Int, b: Int): Int {
        val maxC = max(r, max(g, b))
        val minC = min(r, min(g, b))
        val v = maxC / 255.0
        val s = if (maxC == 0) 0.0 else (maxC - minC).toDouble() / maxC
        var hue = 0.0
        val d = (maxC - minC).toDouble()
        if (d != 0.0) {
            hue = when (maxC) {
                r -> ((g - b) / d) % 6
                g -> (b - r) / d + 2
                else -> (r - g) / d + 4
            } * 60
            if (hue < 0) hue += 360
        }
        // Bright, saturated red/salmon — the filled portion.
        if ((hue <= 18 || hue >= 345) && s >= 0.45 && v >= 0.55) return 1
        // Mid-light grey track (capped below white so a white card isn't a match).
        if (v in 0.62..0.93 && s <= 0.16) return 2
        return 0
    }

    private fun median(list: List<Double>): Double {
        if (list.isEmpty()) return 0.0
        val a = list.sorted()
        val m = a.size / 2
        return if (a.size % 2 == 1) a[m] else (a[m - 1] + a[m]) / 2
    }

    private fun spread(list: List<Double>): Double =
        if (list.isEmpty()) 0.0 else list.max() - list.min()
}
