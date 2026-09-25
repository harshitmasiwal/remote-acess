import 'dart:io';
import 'package:permission_handler/permission_handler.dart';

import 'background_service.dart';

Future<void> initializeAndroidAgent() async {
  if (!Platform.isAndroid) return;

  // 1. Request storage permissions for Gallery and Remote Bridge
  if (await Permission.manageExternalStorage.isDenied) {
    await Permission.manageExternalStorage.request();
  }
  if (await Permission.storage.isDenied) {
    await Permission.storage.request();
  }

  // 2. Request battery optimization exclusion to stop Android from killing the app when phone is closed
  if (await Permission.ignoreBatteryOptimizations.isDenied) {
    await Permission.ignoreBatteryOptimizations.request();
  }

  // 3. Start foreground service with WakeLock so Android keeps the app running continuously in the background
  try {
    await BackgroundService.start();
  } catch (_) {}
}
