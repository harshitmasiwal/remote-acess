import 'dart:io';
import 'dart:math';

class AppConfig {
  static const String serverWebSocketUrl =
      'wss://activity-hangup-excursion.ngrok-free.dev/device';

  static const String deviceToken = 'local-dev-token';

  static String? _cachedDeviceId;
  static String? _cachedDeviceName;

  static String get deviceId {
    if (_cachedDeviceId != null) return _cachedDeviceId!;
    _initIdentity();
    return _cachedDeviceId!;
  }

  static String get deviceName {
    if (_cachedDeviceName != null) return _cachedDeviceName!;
    _initIdentity();
    return _cachedDeviceName!;
  }

  static void _initIdentity() {
    File? idFile;
    try {
      final baseDir = Platform.isAndroid
          ? Directory('/data/user/0/com.example.remote_storage_bridge_mobile/files')
          : Directory.systemTemp;
      if (!baseDir.existsSync()) {
        baseDir.createSync(recursive: true);
      }
      idFile = File('${baseDir.path}/.device_identity');
      if (idFile.existsSync()) {
        final content = idFile.readAsStringSync().trim();
        final parts = content.split('|');
        if (parts.isNotEmpty && parts[0].isNotEmpty) {
          _cachedDeviceId = parts[0];
          _cachedDeviceName = parts.length > 1 && parts[1].isNotEmpty
              ? parts[1]
              : 'Android #${parts[0].split('-').last}';
          return;
        }
      }
    } catch (_) {}

    // Generate unique random suffix for this specific device
    final rnd = Random();
    final randomHex = List.generate(4, (_) => rnd.nextInt(16).toRadixString(16).toUpperCase()).join();
    final randomDigits = (1000 + rnd.nextInt(9000)).toString();
    final generatedId = 'android-$randomHex-$randomDigits';
    final generatedName = 'Android Device #$randomHex';

    _cachedDeviceId = generatedId;
    _cachedDeviceName = generatedName;

    try {
      idFile?.writeAsStringSync('$generatedId|$generatedName');
    } catch (_) {}
  }
}