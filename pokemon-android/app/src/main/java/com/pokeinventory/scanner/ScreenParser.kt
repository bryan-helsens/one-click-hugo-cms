package com.pokeinventory.scanner

/**
 * Kotlin port of the web app's ocr.js field parser: pulls CP, HP and the species
 * name out of the raw text ML Kit recognises on a Pokémon detail screen.
 */
object ScreenParser {

    data class Result(val name: String?, val nameScore: Double, val cp: Int?, val hp: Int?)

    // OCR sometimes reads "CP" as GP/OP/CR — be a little forgiving.
    private val cpRegex = Regex("\\b[CGO][PR]\\s*[:.]?\\s*(\\d{2,5})\\b", RegexOption.IGNORE_CASE)
    private val hpLabeled = Regex("HP[^0-9]{0,4}(\\d{1,3})\\s*/\\s*(\\d{1,3})", RegexOption.IGNORE_CASE)
    private val hpLabeledSingle = Regex("HP[^0-9]{0,4}(\\d{1,3})\\b", RegexOption.IGNORE_CASE)
    private val pairRegex = Regex("(\\d{1,3})\\s*/\\s*(\\d{1,3})")
    private val statLine = Regex("\\bCP\\b|\\d\\s*/\\s*\\d", RegexOption.IGNORE_CASE)
    private val labelLine = Regex("\\b(kg|m|WEIGHT|HEIGHT|POWER|UP|STARDUST)\\b", RegexOption.IGNORE_CASE)

    fun parse(raw: String): Result {
        val lines = raw.split("\n").map { it.trim() }.filter { it.isNotEmpty() }
        val (name, score) = parseName(lines)
        return Result(name, score, parseCP(raw), parseHP(raw))
    }

    private fun parseCP(text: String): Int? {
        val cp = cpRegex.find(text)?.groupValues?.getOrNull(1)?.toIntOrNull() ?: return null
        return if (cp in 10..6000) cp else null
    }

    private fun parseHP(text: String): Int? {
        // "HP 152 / 152" — prefer the max side of a labelled pair.
        hpLabeled.find(text)?.let {
            val hp = it.groupValues[2].toIntOrNull()
            if (hp != null && hp in 1..600) return hp
        }
        // Any "n / n" pair where both sides match (full health).
        val pairs = pairRegex.findAll(text).toList()
        for (p in pairs) {
            val a = p.groupValues[1].toIntOrNull()
            val b = p.groupValues[2].toIntOrNull()
            if (a != null && b != null && a == b && b in 1..600) return b
        }
        // "HP 152" with no slash (some layouts / OCR drops the "/152").
        hpLabeledSingle.find(text)?.groupValues?.get(1)?.toIntOrNull()?.let {
            if (it in 1..600) return it
        }
        // Last resort: the max side of the first plausible pair.
        pairs.firstOrNull()?.groupValues?.get(2)?.toIntOrNull()?.let {
            if (it in 1..600) return it
        }
        return null
    }

    private fun parseName(lines: List<String>): Pair<String?, Double> {
        var best: Pokedex.Match? = null
        for (line in lines) {
            if (statLine.containsMatchIn(line) || labelLine.containsMatchIn(line)) continue
            val candidates = listOf(line) + line.split(Regex("\\s+"))
            for (c in candidates) {
                val m = Pokedex.matchName(c) ?: continue
                if (best == null || m.score > best.score) best = m
            }
        }
        return if (best != null) best.name to best.score else null to 0.0
    }
}
