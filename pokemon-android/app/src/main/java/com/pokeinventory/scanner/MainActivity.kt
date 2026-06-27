package com.pokeinventory.scanner

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import com.pokeinventory.scanner.databinding.ActivityMainBinding
import java.io.File

/**
 * Entry screen. Walks the user through the two permissions the capture needs
 * (overlay + screen capture), starts/stops the [CaptureService], and lists the
 * frames captured so far.
 *
 * Stage 1: a captured "Pokémon" is just the saved screenshot. Stage 2/3 will
 * attach the OCR'd name/CP/HP and IVs.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var projectionManager: MediaProjectionManager

    // Result of the system "Start screen capture?" dialog.
    private val captureLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            startCaptureService(result.resultCode, result.data!!)
        } else {
            Toast.makeText(this, R.string.capture_denied, Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        projectionManager =
            getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        binding.btnOverlayPermission.setOnClickListener { requestOverlayPermission() }
        binding.btnStart.setOnClickListener { onStartClicked() }
        binding.btnStop.setOnClickListener {
            stopService(Intent(this, CaptureService::class.java))
            refresh()
        }
        binding.btnExport.setOnClickListener { exportInventory() }
    }

    /** Write the inventory JSON to a shareable file and fire a share sheet. */
    private fun exportInventory() {
        val json = InventoryStore.exportJson(this)
        if (json.trim() == "[]" || json.isBlank()) {
            Toast.makeText(this, R.string.nothing_to_export, Toast.LENGTH_SHORT).show()
            return
        }
        val dir = File(cacheDir, "exports").apply { mkdirs() }
        val file = File(dir, "pokeinventory-export.json")
        file.writeText(json)
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val share = Intent(Intent.ACTION_SEND).apply {
            type = "application/json"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(share, getString(R.string.export_chooser)))
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun onStartClicked() {
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, R.string.need_overlay, Toast.LENGTH_LONG).show()
            requestOverlayPermission()
            return
        }
        // Ask for screen capture; the result is delivered to captureLauncher.
        captureLauncher.launch(projectionManager.createScreenCaptureIntent())
    }

    private fun startCaptureService(resultCode: Int, data: Intent) {
        val intent = Intent(this, CaptureService::class.java).apply {
            putExtra(CaptureService.EXTRA_RESULT_CODE, resultCode)
            putExtra(CaptureService.EXTRA_RESULT_DATA, data)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        Toast.makeText(this, R.string.scanning_started, Toast.LENGTH_SHORT).show()
    }

    private fun requestOverlayPermission() {
        if (!Settings.canDrawOverlays(this)) {
            startActivity(
                Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName")
                )
            )
        } else {
            Toast.makeText(this, R.string.overlay_granted, Toast.LENGTH_SHORT).show()
        }
    }

    /** Refresh the permission hint and the list of captured frames. */
    private fun refresh() {
        binding.btnOverlayPermission.isEnabled = !Settings.canDrawOverlays(this)
        binding.btnOverlayPermission.text =
            if (Settings.canDrawOverlays(this)) getString(R.string.overlay_ok)
            else getString(R.string.grant_overlay)

        val records = InventoryStore.load(this)
        val rows = records.map { r ->
            val name = r.name ?: "?"
            val star = if (r.legendary) " 👑" else ""
            val iv = if (r.ivAtk != null && r.ivDef != null && r.ivSta != null)
                " · IV ${Math.round((r.ivAtk + r.ivDef + r.ivSta) / 45.0 * 100)}%"
            else ""
            "$name$star — CP ${r.cp ?: "?"} · HP ${r.hp ?: "?"}$iv"
        }
        binding.txtCount.text = getString(R.string.captures_count, rows.size)
        binding.listCaptures.adapter =
            ArrayAdapter(this, android.R.layout.simple_list_item_1, rows)
    }
}
