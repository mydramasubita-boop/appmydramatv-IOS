package com.mydramalife.mobile

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebView
import androidx.core.view.WindowCompat
import androidx.activity.OnBackPressedCallback
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Edge-to-edge — contenuto sotto le barre di sistema
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // 2. Estendi nell'area del notch
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val lp = window.attributes
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.attributes = lp
        }

        // 3. Sfondo nero sulla finestra nativa — elimina barra bianca prima che WebView carichi
        window.decorView.setBackgroundColor(android.graphics.Color.BLACK)
        window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(android.graphics.Color.BLACK))
        window.navigationBarColor = android.graphics.Color.BLACK
        window.statusBarColor = android.graphics.Color.TRANSPARENT

        // 4. Back button → invia keyCode 10009 alla WebView
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val webView: WebView? = bridge?.webView
                if (webView != null) {
                    webView.evaluateJavascript("""
                        (function() {
                            var event = new KeyboardEvent('keydown', {
                                key: 'GoBack', keyCode: 10009, bubbles: true, cancelable: true
                            });
                            document.dispatchEvent(event);
                        })();
                    """.trimIndent(), null)
                }
            }
        })
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            window.decorView.setBackgroundColor(android.graphics.Color.BLACK)
        }
    }
}
