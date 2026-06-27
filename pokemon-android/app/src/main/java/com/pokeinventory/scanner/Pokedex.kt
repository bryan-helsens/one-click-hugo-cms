package com.pokeinventory.scanner

import android.content.Context

/**
 * Kotlin port of the web app's pokedex.js: names + legendary set loaded from
 * assets, with normalization and fuzzy (Levenshtein) matching so OCR'd, slightly
 * garbled names still resolve to a real species.
 */
object Pokedex {

    data class Match(val name: String, val score: Double)

    private var names: List<Pair<String, String>> = emptyList() // display name -> normalized
    private var legendaries: Set<String> = emptySet()
    @Volatile private var loaded = false

    fun init(context: Context) {
        if (loaded) return
        synchronized(this) {
            if (loaded) return
            names = context.assets.open("pokedex.txt").bufferedReader().useLines { seq ->
                seq.map { it.trim() }.filter { it.isNotEmpty() }
                    .map { it to normalize(it) }.toList()
            }
            legendaries = context.assets.open("legendaries.txt").bufferedReader().useLines { seq ->
                seq.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
            }
            loaded = true
        }
    }

    fun normalize(s: String): String =
        s.lowercase().filter { it in 'a'..'z' || it in '0'..'9' }

    fun isLegendary(name: String): Boolean = legendaries.contains(name)

    /** Closest species name to a candidate, or null if nothing is close enough. */
    fun matchName(candidate: String): Match? {
        val norm = normalize(candidate)
        if (norm.length < 3) return null
        var best: Match? = null
        for ((name, n) in names) {
            if (n == norm) return Match(name, 1.0)
            val dist = levenshtein(norm, n)
            val score = 1.0 - dist.toDouble() / maxOf(norm.length, n.length)
            if (best == null || score > best.score) best = Match(name, score)
        }
        return if (best != null && best.score >= 0.6) best else null
    }

    private fun levenshtein(a: String, b: String): Int {
        if (a == b) return 0
        if (a.isEmpty()) return b.length
        if (b.isEmpty()) return a.length
        var prev = IntArray(b.length + 1) { it }
        var curr = IntArray(b.length + 1)
        for (i in 1..a.length) {
            curr[0] = i
            for (j in 1..b.length) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                curr[j] = minOf(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
            }
            val tmp = prev; prev = curr; curr = tmp
        }
        return prev[b.length]
    }
}
