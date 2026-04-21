package com.mydramalife.mobile

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
}
