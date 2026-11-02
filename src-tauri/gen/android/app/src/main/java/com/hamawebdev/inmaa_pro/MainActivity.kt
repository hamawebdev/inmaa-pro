package com.hamawebdev.inmaa_pro

import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

// The program's one activity (docs/phone/ANDROID-BUILD.md section 5).
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // The window sits between the status bar and the navigation bar, and above
    // the keyboard, on every Android version: Android 15 and later draw an app
    // under the bars whatever it asks, so the room is made here, from the
    // system's own insets. The window's env(safe-area-inset-*) then reads 0.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
      WindowInsetsCompat.CONSUMED
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    // Test builds only (npm run android:build:test): the window can be driven
    // from a PC over USB or the emulator (Chrome DevTools Protocol). The
    // release for the phone leaves it off; debug builds have it from Tauri.
    if (BuildConfig.WEBVIEW_DEBUG) {
      WebView.setWebContentsDebuggingEnabled(true)
    }
  }
}
