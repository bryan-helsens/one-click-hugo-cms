package com.pokeinventory.scanner

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** One captured Pokémon. IVs/HP may be filled across two scans (see addOrMerge). */
data class PokemonRecord(
    val id: String = UUID.randomUUID().toString(),
    val name: String?,
    val cp: Int?,
    val hp: Int?,
    val ivAtk: Int? = null,
    val ivDef: Int? = null,
    val ivSta: Int? = null,
    val shiny: Boolean = false,
    val lucky: Boolean = false,
    val shadow: Boolean = false,
    val favorite: Boolean = false,
    val legendary: Boolean = false,
    val ts: Long
) {
    val ivPercent: Int?
        get() = if (ivAtk != null && ivDef != null && ivSta != null)
            Math.round((ivAtk + ivDef + ivSta) / 45.0 * 100).toInt() else null
}

/**
 * JSON-backed inventory in app-private storage. Export format mirrors the web
 * app's records so the two can share data via import/export.
 */
object InventoryStore {

    private const val MERGE_WINDOW_MS = 5 * 60 * 1000L

    private fun file(context: Context) = File(context.filesDir, "inventory.json")

    fun load(context: Context): MutableList<PokemonRecord> {
        val f = file(context)
        if (!f.exists()) return mutableListOf()
        return runCatching {
            val arr = JSONArray(f.readText())
            MutableList(arr.length()) { i ->
                val o = arr.getJSONObject(i)
                PokemonRecord(
                    id = o.optStringOrNull("id") ?: UUID.randomUUID().toString(),
                    name = o.optStringOrNull("name"),
                    cp = o.optIntOrNull("cp"),
                    hp = o.optIntOrNull("hp"),
                    ivAtk = o.optIntOrNull("ivAtk"),
                    ivDef = o.optIntOrNull("ivDef"),
                    ivSta = o.optIntOrNull("ivSta"),
                    shiny = o.optBoolean("shiny", false),
                    lucky = o.optBoolean("lucky", false),
                    shadow = o.optBoolean("shadow", false),
                    favorite = o.optBoolean("favorite", false),
                    legendary = o.optBoolean("legendary", false),
                    ts = o.optLong("ts", 0L)
                )
            }
        }.getOrElse { mutableListOf() }
    }

    /**
     * Add a scan. If a recent record of the same species (and matching/absent CP)
     * exists, merge the new non-null fields into it instead of creating a
     * duplicate — this lets a detail-screen scan (name/CP/HP) and an appraisal
     * scan (IVs) combine into one complete Pokémon.
     *
     * @return the resulting record (merged or newly added).
     */
    fun addOrMerge(context: Context, rec: PokemonRecord): PokemonRecord {
        val list = load(context)
        val idx = list.indexOfFirst { existing ->
            existing.name != null && rec.name != null &&
                existing.name.equals(rec.name, ignoreCase = true) &&
                (existing.cp == rec.cp || existing.cp == null || rec.cp == null) &&
                (rec.ts - existing.ts) in 0..MERGE_WINDOW_MS
        }
        val result: PokemonRecord
        if (idx >= 0) {
            result = merge(list[idx], rec)
            list[idx] = result
        } else {
            result = rec
            list.add(0, rec)
        }
        save(context, list)
        return result
    }

    private fun merge(a: PokemonRecord, b: PokemonRecord) = a.copy(
        name = a.name ?: b.name,
        cp = a.cp ?: b.cp,
        hp = a.hp ?: b.hp,
        ivAtk = a.ivAtk ?: b.ivAtk,
        ivDef = a.ivDef ?: b.ivDef,
        ivSta = a.ivSta ?: b.ivSta,
        shiny = a.shiny || b.shiny,
        lucky = a.lucky || b.lucky,
        shadow = a.shadow || b.shadow,
        favorite = a.favorite || b.favorite,
        legendary = a.legendary || b.legendary
    )

    fun update(context: Context, rec: PokemonRecord) {
        val list = load(context)
        val idx = list.indexOfFirst { it.id == rec.id }
        if (idx >= 0) list[idx] = rec else list.add(0, rec)
        save(context, list)
    }

    fun delete(context: Context, id: String) {
        val list = load(context).filterNot { it.id == id }
        save(context, list)
    }

    fun clear(context: Context) = save(context, emptyList())

    fun deleteAll(context: Context, ids: Set<String>) {
        save(context, load(context).filterNot { ids.contains(it.id) })
    }

    /**
     * Transfer suggestions: among duplicates of the same species, the weaker
     * copies (lower IV%, then CP) that aren't favorited/shiny/lucky/shadow/
     * legendary. Mirrors the web app's logic.
     */
    fun transferSuggestions(list: List<PokemonRecord>): Set<String> {
        val out = mutableSetOf<String>()
        list.filter { it.name != null }
            .groupBy { it.name!!.lowercase() }
            .forEach { (_, group) ->
                if (group.size < 2) return@forEach
                val ranked = group.sortedWith(
                    compareByDescending<PokemonRecord> { it.ivPercent ?: -1 }
                        .thenByDescending { it.cp ?: 0 }
                )
                ranked.drop(1).forEach { p ->
                    val isProtected =
                        p.favorite || p.shiny || p.lucky || p.shadow || p.legendary
                    if (!isProtected) out.add(p.id)
                }
            }
        return out
    }

    fun save(context: Context, list: List<PokemonRecord>) {
        val arr = JSONArray()
        for (r in list) {
            arr.put(JSONObject().apply {
                put("id", r.id)
                put("name", r.name ?: JSONObject.NULL)
                put("cp", r.cp ?: JSONObject.NULL)
                put("hp", r.hp ?: JSONObject.NULL)
                put("ivAtk", r.ivAtk ?: JSONObject.NULL)
                put("ivDef", r.ivDef ?: JSONObject.NULL)
                put("ivSta", r.ivSta ?: JSONObject.NULL)
                put("shiny", r.shiny)
                put("lucky", r.lucky)
                put("shadow", r.shadow)
                put("favorite", r.favorite)
                put("legendary", r.legendary)
                put("ts", r.ts)
            })
        }
        file(context).writeText(arr.toString(2))
    }

    fun exportJson(context: Context): String =
        file(context).let { if (it.exists()) it.readText() else "[]" }

    private fun JSONObject.optStringOrNull(key: String): String? =
        if (!has(key) || isNull(key)) null else optString(key)

    private fun JSONObject.optIntOrNull(key: String): Int? =
        if (!has(key) || isNull(key)) null else optInt(key)
}
