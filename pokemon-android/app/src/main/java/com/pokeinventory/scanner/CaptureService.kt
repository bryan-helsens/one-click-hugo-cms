package com.pokeinventory.scanner

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
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
import android.view.View
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
        private const val AUTO_INTERVAL = 1500L // ms between auto-capture samples
        private const val AUTO_NAME_MIN = 0.7 // min fuzzy name score to auto-save
        private const val AUTO_RECENT_MAX = 12 // de-dupe memory size
    }

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var overlayButton: Button? = null
    private var overlayParams: WindowManager.LayoutParams? = null
    private lateinit var windowManager: WindowManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private var autoMode = false
    // Auto-capture de-dupe/confirmation state (guarded by autoLock; OCR/IV run
    // on background threads). A key is "name|cp|iv?" so a detail screen and an
    // appraisal screen of the same Pokémon are both captured (and then merged).
    private val autoLock = Any()
    private var pendingAutoKey: String? = null
    private val recentAutoKeys = ArrayDeque<String>()

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

        // Tap = capture · drag = reposition · long-press = toggle auto-capture.
        val slop = ViewConfiguration.get(this).scaledTouchSlop
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var dragging = false
        var longFired = false
        val longPress = Runnable {
            if (!dragging) { longFired = true; toggleAuto() }
        }
        button.setOnTouchListener { v, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY
                    startX = params.x; startY = params.y
                    dragging = false; longFired = false
                    mainHandler.postDelayed(longPress, 600)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (!dragging && hypot(dx, dy) > slop) {
                        dragging = true
                        mainHandler.removeCallbacks(longPress)
                    }
                    if (dragging) {
                        params.x = startX + dx.toInt()
                        params.y = startY + dy.toInt()
                        runCatching { windowManager.updateViewLayout(v, params) }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    mainHandler.removeCallbacks(longPress)
                    if (!dragging && !longFired) v.performClick()
                    true
                }
                else -> false
            }
        }

        overlayButton = button
        overlayParams = params
        windowManager.addView(button, params)
    }

    private fun idleText() =
        if (autoMode) getString(R.string.auto_on_label) else getString(R.string.scan_button)

    /** Briefly show the scan result on the floating button, then reset it. */
    private fun flashResult(text: String) {
        mainHandler.post {
            overlayButton?.text = text
            mainHandler.postDelayed({ overlayButton?.text = idleText() }, 3000)
        }
    }

    /** Long-press toggles hands-free auto-capture (reads each screen as you browse). */
    private fun toggleAuto() {
        autoMode = !autoMode
        if (autoMode) {
            synchronized(autoLock) { pendingAutoKey = null; recentAutoKeys.clear() }
            overlayButton?.text = idleText()
            toast(getString(R.string.auto_on))
            mainHandler.postDelayed(autoRunnable, AUTO_INTERVAL)
        } else {
            mainHandler.removeCallbacks(autoRunnable)
            overlayButton?.text = idleText()
            toast(getString(R.string.auto_off))
        }
    }

    private val autoRunnable = object : Runnable {
        override fun run() {
            if (!autoMode) return
            val image = imageReader?.acquireLatestImage()
            if (image != null) {
                try {
                    val bmp = buildBitmap(image)
                    blankButtonRegion(bmp) // keep the overlay out of the analysis
                    recognize(bmp, auto = true)
                } catch (_: Exception) {
                } finally {
                    image.close()
                }
            }
            mainHandler.postDelayed(this, AUTO_INTERVAL)
        }
    }

    /** Paint over the floating button's area so it isn't mistaken for stats. */
    private fun blankButtonRegion(bitmap: Bitmap) {
        val btn = overlayButton ?: return
        val p = overlayParams ?: return
        val left = p.x.coerceIn(0, bitmap.width)
        val top = p.y.coerceIn(0, bitmap.height)
        val right = (p.x + btn.width).coerceIn(0, bitmap.width)
        val bottom = (p.y + btn.height).coerceIn(0, bitmap.height)
        if (right > left && bottom > top) {
            Canvas(bitmap).drawRect(
                left.toFloat(), top.toFloat(), right.toFloat(), bottom.toFloat(),
                Paint().apply { color = Color.BLACK }
            )
        }
    }

    /**
     * Hide the floating button, wait for a clean frame, then capture — otherwise
     * the button (which the user can drag over the stats) ends up in the
     * screenshot and blocks the OCR / IV bars.
     */
    private fun captureFrame() {
        val btn = overlayButton
        btn?.visibility = View.INVISIBLE
        // Drain the buffered frame that still contains the button, then grab the
        // next one rendered without it.
        mainHandler.postDelayed({
            runCatching { imageReader?.acquireLatestImage()?.close() }
            mainHandler.postDelayed({
                doCapture()
                btn?.visibility = View.VISIBLE
            }, 60)
        }, 90)
    }

    private fun doCapture() {
        val image = imageReader?.acquireLatestImage()
        if (image == null) {
            toast(getString(R.string.no_frame))
            return
        }
        try {
            recognize(buildBitmap(image))
        } catch (e: Exception) {
            toast(getString(R.string.capture_error, e.message ?: ""))
        } finally {
            image.close()
        }
    }

    /** Convert a mirrored ImageReader frame into a cropped ARGB bitmap. */
    private fun buildBitmap(image: Image): Bitmap {
        val plane = image.planes[0]
        val pixelStride = plane.pixelStride
        val rowPadding = plane.rowStride - pixelStride * width
        val raw = Bitmap.createBitmap(
            width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888
        )
        raw.copyPixelsFromBuffer(plane.buffer)
        val cropped = Bitmap.createBitmap(raw, 0, 0, width, height)
        raw.recycle()
        return cropped
    }

    /**
     * Auto-mode gate: returns true only when this key has been seen on two
     * consecutive samples and wasn't recently saved. Thread-safe.
     */
    private fun shouldAutoSave(key: String): Boolean {
        synchronized(autoLock) {
            if (recentAutoKeys.contains(key)) return false
            if (key != pendingAutoKey) {
                pendingAutoKey = key
                return false
            }
            pendingAutoKey = null
            recentAutoKeys.addLast(key)
            while (recentAutoKeys.size > AUTO_RECENT_MAX) recentAutoKeys.removeFirst()
            return true
        }
    }

    /**
     * OCR the frame for name/CP/HP, read the IV bars from the same frame, and
     * store an inventory record. The IV pixel work runs off the main thread.
     */
    private fun recognize(bitmap: Bitmap, auto: Boolean = false) {
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener { visionText ->
                val res = ScreenParser.parse(visionText.text)

                Thread {
                    val iv = runCatching { IvScanner.scan(bitmap) }
                        .getOrDefault(IvScanner.IvResult(null, null, null, 0.0))
                    bitmap.recycle()

                    if (auto) {
                        // Require a confident name + CP, and confirm the same
                        // screen across two samples before saving (filters out
                        // transient/animation frames). The key includes whether
                        // IVs were read, so a detail then an appraisal screen of
                        // the same Pokémon are both captured and then merged.
                        if (res.name == null || res.cp == null || res.nameScore < AUTO_NAME_MIN) return@Thread
                        val key = "${res.name}|${res.cp}|${if (iv.complete) "iv" else "no"}"
                        if (!shouldAutoSave(key)) return@Thread
                    } else if (res.name == null && res.cp == null && iv.atk == null) {
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
                if (!auto) toast(getString(R.string.capture_error, e.message ?: ""))
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
        autoMode = false
        mainHandler.removeCallbacks(autoRunnable)
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
