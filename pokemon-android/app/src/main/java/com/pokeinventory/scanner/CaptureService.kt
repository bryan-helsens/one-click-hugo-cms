package com.pokeinventory.scanner

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.Button
import android.widget.Toast
import androidx.core.app.ServiceCompat
import kotlin.math.hypot
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

/**
 * Foreground service that owns the screen-capture session and the floating
 * capture button.
 *
 * Lifecycle: MainActivity hands us the MediaProjection permission result; we go
 * foreground (required for type=mediaProjection), build a VirtualDisplay that
 * mirrors the screen into an ImageReader, and show an overlay button. Each tap
 * grabs the latest frame, OCRs it (ML Kit) into name/CP/HP via [ScreenParser],
 * and stores a record via [InventoryStore].
 *
 * Stage 3 will additionally feed the Bitmap to the IV-bar scanner before saving.
 */
class CaptureService : Service() {

    companion object {
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        private const val CHANNEL_ID = "capture"
        private const val NOTIF_ID = 42
    }

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var overlayButton: Button? = null
    private lateinit var windowManager: WindowManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private var width = 0
    private var height = 0
    private var density = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        val fgsType =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            else 0
        ServiceCompat.startForeground(this, NOTIF_ID, buildNotification(), fgsType)

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val data: Intent? =
            if (Build.VERSION.SDK_INT >= 33)
                intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
            else
                @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_RESULT_DATA)

        if (data == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        Pokedex.init(applicationContext)
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        readScreenMetrics()
        startProjection(resultCode, data)
        showOverlayButton()
        return START_STICKY
    }

    private fun readScreenMetrics() {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)
        width = metrics.widthPixels
        height = metrics.heightPixels
        density = metrics.densityDpi
    }

    private fun startProjection(resultCode: Int, data: Intent) {
        val manager =
            getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection = manager.getMediaProjection(resultCode, data).apply {
            registerCallback(object : MediaProjection.Callback() {
                override fun onStop() = teardown()
            }, mainHandler)
        }

        imageReader = ImageReader.newInstance(
            width, height, PixelFormat.RGBA_8888, 2
        )
        virtualDisplay = projection?.createVirtualDisplay(
            "PokeCapture",
            width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader!!.surface,
            null,
            mainHandler
        )
    }

    private fun showOverlayButton() {
        val type =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 24
            y = height / 3
        }

        val button = Button(this).apply { text = getString(R.string.scan_button) }
        button.setOnClickListener { captureFrame() }

        // Drag to reposition; a tap (no real movement) triggers a capture.
        val slop = ViewConfiguration.get(this).scaledTouchSlop
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var dragging = false
        button.setOnTouchListener { v, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY
                    startX = params.x; startY = params.y
                    dragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (!dragging && hypot(dx, dy) > slop) dragging = true
                    if (dragging) {
                        params.x = startX + dx.toInt()
                        params.y = startY + dy.toInt()
                        runCatching { windowManager.updateViewLayout(v, params) }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!dragging) v.performClick()
                    true
                }
                else -> false
            }
        }

        overlayButton = button
        windowManager.addView(button, params)
    }

    /** Briefly show the scan result on the floating button, then reset it. */
    private fun flashResult(text: String) {
        mainHandler.post {
            overlayButton?.text = text
            mainHandler.postDelayed(
                { overlayButton?.text = getString(R.string.scan_button) },
                3000
            )
        }
    }

    /** Grab the most recent mirrored frame and persist it. */
    private fun captureFrame() {
        val image = imageReader?.acquireLatestImage()
        if (image == null) {
            toast(getString(R.string.no_frame))
            return
        }
        try {
            val plane = image.planes[0]
            val rowStride = plane.rowStride
            val pixelStride = plane.pixelStride
            val rowPadding = rowStride - pixelStride * width

            val bitmap = Bitmap.createBitmap(
                width + rowPadding / pixelStride,
                height,
                Bitmap.Config.ARGB_8888
            )
            bitmap.copyPixelsFromBuffer(plane.buffer)
            val cropped = Bitmap.createBitmap(bitmap, 0, 0, width, height)
            bitmap.recycle()
            recognize(cropped)
        } catch (e: Exception) {
            toast(getString(R.string.capture_error, e.message ?: ""))
        } finally {
            image.close()
        }
    }

    /**
     * OCR the frame for name/CP/HP, read the IV bars from the same frame, and
     * store an inventory record. The IV pixel work runs off the main thread.
     */
    private fun recognize(bitmap: Bitmap) {
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener { visionText ->
                val res = ScreenParser.parse(visionText.text)
                Thread {
                    val iv = runCatching { IvScanner.scan(bitmap) }
                        .getOrDefault(IvScanner.IvResult(null, null, null, 0.0))
                    bitmap.recycle()

                    if (res.name == null && res.cp == null && iv.atk == null) {
                        flashResult(getString(R.string.scan_nothing))
                        toast(getString(R.string.scan_nothing))
                        return@Thread
                    }

                    val legendary = res.name != null && Pokedex.isLegendary(res.name)
                    val saved = InventoryStore.addOrMerge(
                        this,
                        PokemonRecord(
                            name = res.name,
                            cp = res.cp,
                            hp = res.hp,
                            ivAtk = iv.atk,
                            ivDef = iv.def,
                            ivSta = iv.sta,
                            legendary = legendary,
                            ts = System.currentTimeMillis()
                        )
                    )
                    val ivPct = saved.ivPercent?.let { " · IV $it%" } ?: ""
                    val summary = "✓ ${saved.name ?: "?"} · CP ${saved.cp ?: "?"}" +
                        " · HP ${saved.hp ?: "?"}$ivPct"
                    flashResult(summary)
                    toast(summary)
                }.start()
            }
            .addOnFailureListener { e ->
                toast(getString(R.string.capture_error, e.message ?: ""))
                bitmap.recycle()
            }
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.channel_name),
                    NotificationManager.IMPORTANCE_LOW
                )
            )
        }
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .build()
    }

    private fun toast(msg: String) =
        mainHandler.post { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show() }

    private fun teardown() {
        overlayButton?.let { runCatching { windowManager.removeView(it) } }
        overlayButton = null
        virtualDisplay?.release()
        imageReader?.close()
        projection?.stop()
        virtualDisplay = null
        imageReader = null
        projection = null
    }

    override fun onDestroy() {
        teardown()
        super.onDestroy()
    }
}
