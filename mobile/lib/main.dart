import 'dart:async';

import 'package:flutter/material.dart';

import 'android_permissions.dart';
import 'bridge_client.dart';

void main() {
  runApp(const RemoteBridgeApp());
}

class RemoteBridgeApp extends StatefulWidget {
  const RemoteBridgeApp({super.key, this.startClient = true});

  final bool startClient;

  @override
  State<RemoteBridgeApp> createState() => _RemoteBridgeAppState();
}

class _RemoteBridgeAppState extends State<RemoteBridgeApp> {
  late final BridgeClient _client;

  @override
  void initState() {
    super.initState();
    _client = BridgeClient();
    if (widget.startClient) {
      unawaited(initializeAndroidAgent());
      _client.start();
    }
  }

  @override
  void dispose() {
    _client.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(home: SizedBox.shrink());
  }
}
