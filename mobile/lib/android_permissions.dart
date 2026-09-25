import 'package:permission_handler/permission_handler.dart';

import 'background_service.dart';

Future<void> initializeAndroidAgent() async {
  // Android 11+ exposes shared storage through this special access screen.
  // The OS still enforces its restrictions; this is not a sandbox bypass.
  await Permission.manageExternalStorage.request();
  await Permission.notification.request();
  await BackgroundService.start();
}
