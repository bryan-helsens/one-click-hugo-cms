package com.pokeinventory.scanner

import android.content.Context
import android.graphics.Bitmap
import java.io.File
import java.io.FileOutputStream

/**
 * Stage 1 storage: captured frames are PNGs under app-private files/captures.
 * Stage 3 will replace this with a proper inventory model (name/CP/HP/IVs) plus
 * JSON export compatible with the web app's import.
 */
object CaptureStore {

    private fun dir(context: Context): File =
        File(context.filesDir, "captures").apply { mkdirs() }

    /** Save a bitmap as a timestamped PNG and return the file. */
    fun save(context: Context, bitmap: Bitmap): File {
        val file = File(dir(context), "capture_${System.currentTimeMillis()}.png")
        FileOutputStream(file).use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        }
        return file
    }

    /** Captured files, newest first. */
    fun list(context: Context): List<File> =
        dir(context).listFiles()?.sortedByDescending { it.lastModified() } ?: emptyList()
}
