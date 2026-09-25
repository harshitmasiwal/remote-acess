import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'config.dart';
import 'file_command_handler.dart';
import 'protocol.dart';

enum BridgeStatus { disconnected, connecting, connected }

class BridgeClient {
  BridgeClient({
    FileCommandHandler? commandHandler,
    this.onStatus,
  }) : _commandHandler = commandHandler ?? FileCommandHandler();

  final FileCommandHandler _commandHandler;
  final void Function(BridgeStatus status)? onStatus;
  WebSocketChannel? _channel;
  Timer? _retry;
  bool _stopped = false;
  int _retryAttempt = 0;

  void start() {
    _stopped = false;
    _retryAttempt = 0;
    _connect();
  }

  void stop() {
    _stopped = true;
    _retry?.cancel();
    _channel?.sink.close();
    _channel = null;
    onStatus?.call(BridgeStatus.disconnected);
  }

  void _connect() {
    if (_stopped) return;
    onStatus?.call(BridgeStatus.connecting);
    final base = Uri.parse(AppConfig.serverWebSocketUrl);
    final uri = base.replace(queryParameters: {
      'deviceId': AppConfig.deviceId,
      'token': AppConfig.deviceToken,
    });
    try {
      final channel = IOWebSocketChannel.connect(
        uri,
        pingInterval: const Duration(seconds: 15),
      );
      _channel = channel;
      channel.stream.listen(
        (message) => unawaited(_onMessage(message)),
        onDone: _scheduleReconnect,
        onError: (_) => _scheduleReconnect(),
      );
      channel.sink.add(jsonEncode({
        'type': 'ready',
        'deviceId': AppConfig.deviceId,
        'name': AppConfig.deviceName,
        'platform': Platform.operatingSystem,
      }));
      _retryAttempt = 0;
      onStatus?.call(BridgeStatus.connected);
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_stopped || _retry?.isActive == true) return;
    _channel = null;
    onStatus?.call(BridgeStatus.disconnected);
    final delaySeconds = math.min(30, 1 << _retryAttempt);
    _retryAttempt = math.min(_retryAttempt + 1, 5);
    _retry = Timer(Duration(seconds: delaySeconds), _connect);
  }

  Future<void> _onMessage(dynamic raw) async {
    if (raw is! String) return;
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      if (json['type'] != 'command') return;
      final command = CommandMessage.fromJson(json);
      try {
        final data = await _commandHandler.execute(command.command, command.payload);
        _send({'type': 'response', 'id': command.id, 'ok': true, 'data': data});
      } catch (error) {
        _send({'type': 'response', 'id': command.id, 'ok': false, 'error': '$error'});
      }
    } catch (_) {
      // Ignore malformed server messages; the connection remains usable.
    }
  }

  void _send(Map<String, dynamic> message) {
    _channel?.sink.add(jsonEncode(message));
  }
}
