package com.pokeinventory.scanner

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** One captured Pokémon. IV fields stay null until Stage 3 reads the bars. */
data class PokemonRecord(
    val name: String?,
    val cp: Int?,
    val hp: Int?,
    val ivAtk: Int? = null,
    val ivDef: Int? = null,
    val ivSta: Int? = null,
    val legendary: Boolean = false,
    val ts: Long
)

/**
 * JSON-backed inventory in app-private storage. The export format mirrors the
 * web app's records so the two can share data via import/export.
 */
object InventoryStore {

    private fun file(context: Context) = File(context.filesDir, "inventory.json")

    fun load(context: Context): MutableList<PokemonRecord> {
        val f = file(context)
        if (!f.exists()) return mutableListOf()
        return runCatching {
            val arr = JSONArray(f.readText())
            MutableList(arr.length()) { i ->
                val o = arr.getJSONObject(i)
                PokemonRecord(
                    name = o.optStringOrNull("name"),
                    cp = o.optIntOrNull("cp"),
                    hp = o.optIntOrNull("hp"),
                    ivAtk = o.optIntOrNull("ivAtk"),
                    ivDef = o.optIntOrNull("ivDef"),
                    ivSta = o.optIntOrNull("ivSta"),
                    legendary = o.optBoolean("legendary", false),
                    ts = o.optLong("ts", 0L)
                )
            }
        }.getOrElse { mutableListOf() }
    }

    fun add(context: Context, record: PokemonRecord) {
        val list = load(context)
        list.add(0, record)
        save(context, list)
    }

    fun save(context: Context, list: List<PokemonRecord>) {
        val arr = JSONArray()
        for (r in list) {
            arr.put(JSONObject().apply {
                put("name", r.name ?: JSONObject.NULL)
                put("cp", r.cp ?: JSONObject.NULL)
                put("hp", r.hp ?: JSONObject.NULL)
                put("ivAtk", r.ivAtk ?: JSONObject.NULL)
                put("ivDef", r.ivDef ?: JSONObject.NULL)
                put("ivSta", r.ivSta ?: JSONObject.NULL)
                put("legendary", r.legendary)
                put("ts", r.ts)
            })
        }
        file(context).writeText(arr.toString(2))
    }

    fun exportJson(context: Context): String = file(context).let {
        if (it.exists()) it.readText() else "[]"
    }

    private fun JSONObject.optStringOrNull(key: String): String? =
        if (isNull(key) || !has(key)) null else optString(key)

    private fun JSONObject.optIntOrNull(key: String): Int? =
        if (isNull(key) || !has(key)) null else optInt(key)
}
