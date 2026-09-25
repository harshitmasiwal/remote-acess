package com.example.remote_storage_bridge_mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channelName = "remote_bridge/background"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "start" -> {
                        BridgeForegroundService.start(this)
                        result.success(null)
                    }
                    "stop" -> {
                        BridgeForegroundService.stop(this)
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
