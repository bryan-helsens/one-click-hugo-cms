package com.pokeinventory.scanner

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.CheckBox
import android.widget.EditText
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import com.pokeinventory.scanner.databinding.ActivityMainBinding
import java.io.File

/**
 * Entry screen + inventory manager. Handles the two capture permissions
 * (overlay + screen capture), starts/stops the [CaptureService], lists captured
 * Pokémon, and lets you edit/delete each one.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var projectionManager: MediaProjectionManager
    private var records: List<PokemonRecord> = emptyList()
    private var transferIds: Set<String> = emptySet()
    private val sortOptions = listOf("Newest", "CP: high→low", "IV%: high→low", "Name A→Z")

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
        binding.btnClear.setOnClickListener { confirmClearAll() }
        binding.btnDeleteTransfer.setOnClickListener { confirmDeleteTransfers() }
        binding.listCaptures.setOnItemClickListener { _, _, position, _ ->
            records.getOrNull(position)?.let { showEditDialog(it) }
        }

        // Filter + sort controls
        binding.spinnerSort.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item, sortOptions
        )
        binding.spinnerSort.onItemSelectedListener =
            object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) = refresh()
                override fun onNothingSelected(p: AdapterView<*>?) {}
            }
        binding.cbTransferOnly.setOnCheckedChangeListener { _, _ -> refresh() }
        binding.search.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) = refresh()
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        })
    }

    private fun confirmDeleteTransfers() {
        if (transferIds.isEmpty()) {
            Toast.makeText(this, R.string.no_transfers, Toast.LENGTH_SHORT).show()
            return
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.delete_transfers_title)
            .setMessage(getString(R.string.delete_transfers_msg, transferIds.size))
            .setPositiveButton(R.string.delete) { _, _ ->
                InventoryStore.deleteAll(this, transferIds)
                refresh()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun confirmClearAll() {
        if (records.isEmpty()) {
            Toast.makeText(this, R.string.nothing_to_export, Toast.LENGTH_SHORT).show()
            return
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.clear_all_title)
            .setMessage(R.string.clear_all_msg)
            .setPositiveButton(R.string.delete) { _, _ ->
                InventoryStore.clear(this)
                refresh()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    /** Edit dialog for a single Pokémon: all fields + tags, save or delete. */
    private fun showEditDialog(record: PokemonRecord) {
        val view = layoutInflater.inflate(R.layout.dialog_edit, null)
        fun et(id: Int) = view.findViewById<EditText>(id)
        fun cb(id: Int) = view.findViewById<CheckBox>(id)

        et(R.id.e_name).setText(record.name ?: "")
        et(R.id.e_cp).setText(record.cp?.toString() ?: "")
        et(R.id.e_hp).setText(record.hp?.toString() ?: "")
        et(R.id.e_iv_atk).setText(record.ivAtk?.toString() ?: "")
        et(R.id.e_iv_def).setText(record.ivDef?.toString() ?: "")
        et(R.id.e_iv_sta).setText(record.ivSta?.toString() ?: "")
        cb(R.id.e_shiny).isChecked = record.shiny
        cb(R.id.e_lucky).isChecked = record.lucky
        cb(R.id.e_shadow).isChecked = record.shadow
        cb(R.id.e_favorite).isChecked = record.favorite
        cb(R.id.e_legendary).isChecked = record.legendary

        AlertDialog.Builder(this)
            .setTitle(R.string.edit_title)
            .setView(view)
            .setPositiveButton(R.string.save) { _, _ ->
                fun num(id: Int) = et(id).text.toString().trim().toIntOrNull()
                val name = et(R.id.e_name).text.toString().trim().ifEmpty { null }
                InventoryStore.update(
                    this,
                    record.copy(
                        name = name,
                        cp = num(R.id.e_cp),
                        hp = num(R.id.e_hp),
                        ivAtk = num(R.id.e_iv_atk)?.coerceIn(0, 15),
                        ivDef = num(R.id.e_iv_def)?.coerceIn(0, 15),
                        ivSta = num(R.id.e_iv_sta)?.coerceIn(0, 15),
                        shiny = cb(R.id.e_shiny).isChecked,
                        lucky = cb(R.id.e_lucky).isChecked,
                        shadow = cb(R.id.e_shadow).isChecked,
                        favorite = cb(R.id.e_favorite).isChecked,
                        legendary = cb(R.id.e_legendary).isChecked
                    )
                )
                refresh()
            }
            .setNeutralButton(R.string.delete) { _, _ ->
                InventoryStore.delete(this, record.id)
                refresh()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
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

        val all = InventoryStore.load(this)
        transferIds = InventoryStore.transferSuggestions(all)

        val query = binding.search.text.toString().trim().lowercase()
        var list = all.filter { (it.name ?: "").lowercase().contains(query) }
        if (binding.cbTransferOnly.isChecked) {
            list = list.filter { transferIds.contains(it.id) }
        }
        list = when (binding.spinnerSort.selectedItemPosition) {
            1 -> list.sortedByDescending { it.cp ?: 0 }
            2 -> list.sortedByDescending { it.ivPercent ?: -1 }
            3 -> list.sortedBy { (it.name ?: "").lowercase() }
            else -> list.sortedByDescending { it.ts }
        }
        records = list

        val rows = list.map { r ->
            val tags = buildString {
                if (r.shiny) append(" ✨")
                if (r.lucky) append(" 🍀")
                if (r.shadow) append(" 🌑")
                if (r.favorite) append(" ⭐")
                if (r.legendary) append(" 👑")
                if (transferIds.contains(r.id)) append(" 🗑️")
            }
            val iv = r.ivPercent?.let { " · IV $it%" } ?: ""
            "${r.name ?: "?"}$tags — CP ${r.cp ?: "?"} · HP ${r.hp ?: "?"}$iv"
        }
        binding.txtCount.text = getString(R.string.captures_count, list.size)
        binding.listCaptures.adapter = ArrayAdapter(
            this, android.R.layout.simple_list_item_1, rows
        )
    }
}
