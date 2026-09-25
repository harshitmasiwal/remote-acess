import 'package:flutter/services.dart';

class BackgroundService {
  static const MethodChannel _channel = MethodChannel('remote_bridge/background');

  static Future<void> start() async {
    await _channel.invokeMethod<void>('start');
  }

  static Future<void> stop() async {
    await _channel.invokeMethod<void>('stop');
  }
}
