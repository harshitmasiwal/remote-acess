import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:path/path.dart' as p;

class FileCommandHandler {
  Directory? _root;

  Future<Directory> get _storage async {
    return _root ??= Directory('/storage/emulated/0');
  }

  String _validateRelativePath(Object? value, {bool allowEmpty = true}) {
    if (value is! String || value.length > 4096 || value.contains('\x00')) {
      throw const FormatException('invalid path');
    }
    if (value.isEmpty && allowEmpty) return value;
    if (value.startsWith('/') ||
        value.contains('\\') ||
        RegExp(r'^[A-Za-z]:').hasMatch(value)) {
      throw const FormatException('path must be relative');
    }
    final segments = value.split('/');
    if (segments.any((segment) => segment.isEmpty || segment == '.' || segment == '..')) {
      throw const FormatException('path contains an invalid segment');
    }
    return segments.join('/');
  }

  Future<Map<String, dynamic>> execute(
    String command,
    Map<String, dynamic> payload,
  ) async {
    switch (command) {
      case 'LIST':
        return _list(payload['path']);
      case 'STAT':
        return _stat(payload['path']);
      case 'DELETE':
        return _delete(payload['path']);
      case 'RENAME':
        return _rename(payload['source'], payload['destination']);
      case 'CREATE_DIRECTORY':
        return _createDirectory(payload['path']);
      case 'DOWNLOAD':
        return _download(payload['path'], payload['offset'], payload['chunkSize']);
      default:
        throw UnsupportedError('unsupported command: $command');
    }
  }

  Future<Map<String, dynamic>> _list(Object? value) async {
    final relative = _validateRelativePath(value);
    final root = await _storage;
    final directory = Directory(p.join(root.path, relative));
    final entries = <Map<String, dynamic>>[];
    await for (final entity in directory.list(followLinks: false)) {
      final stat = await entity.stat();
      final name = p.basename(entity.path);
      final childPath = relative.isEmpty ? name : '$relative/$name';
      entries.add({
        'name': name,
        'path': childPath,
        'type': stat.type == FileSystemEntityType.directory ? 'directory' : 'file',
        'size': stat.size,
        'modifiedAt': stat.modified.toUtc().toIso8601String(),
      });
    }
    entries.sort((a, b) => (a['name'] as String).compareTo(b['name'] as String));
    return {'path': relative, 'entries': entries};
  }

  Future<Map<String, dynamic>> _stat(Object? value) async {
    final relative = _validateRelativePath(value, allowEmpty: false);
    final root = await _storage;
    final stat = await File(p.join(root.path, relative)).stat();
    return {
      'path': relative,
      'type': stat.type == FileSystemEntityType.directory ? 'directory' : 'file',
      'size': stat.size,
      'modifiedAt': stat.modified.toUtc().toIso8601String(),
    };
  }

  Future<Map<String, dynamic>> _delete(Object? value) async {
    final relative = _validateRelativePath(value, allowEmpty: false);
    final root = await _storage;
    final file = File(p.join(root.path, relative));
    final directory = Directory(file.path);
    if (await file.exists()) {
      await file.delete();
    } else if (await directory.exists()) {
      await directory.delete(recursive: true);
    } else {
      throw const FileSystemException('file does not exist');
    }
    return {'path': relative, 'deleted': true};
  }

  Future<Map<String, dynamic>> _rename(Object? source, Object? destination) async {
    final from = _validateRelativePath(source, allowEmpty: false);
    final to = _validateRelativePath(destination, allowEmpty: false);
    final root = await _storage;
    final sourceEntity = File(p.join(root.path, from));
    final destinationPath = p.join(root.path, to);
    try {
      await sourceEntity.rename(destinationPath);
    } on FileSystemException {
      await Directory(p.join(root.path, from)).rename(destinationPath);
    }
    return {'source': from, 'destination': to, 'renamed': true};
  }

  Future<Map<String, dynamic>> _createDirectory(Object? value) async {
    final relative = _validateRelativePath(value, allowEmpty: false);
    final root = await _storage;
    await Directory(p.join(root.path, relative)).create(recursive: true);
    return {'path': relative, 'created': true};
  }

  Future<Map<String, dynamic>> _download(
    Object? value,
    Object? offsetValue,
    Object? chunkSizeValue,
  ) async {
    final relative = _validateRelativePath(value, allowEmpty: false);
    final offset = (offsetValue is num ? offsetValue.toInt() : 0)
        .clamp(0, 1 << 62)
        .toInt();
    final chunkSize = (chunkSizeValue is num ? chunkSizeValue.toInt() : 256 * 1024)
        .clamp(1, 1024 * 1024)
        .toInt();
    final root = await _storage;
    final file = File(p.join(root.path, relative));
    final length = await file.length();
    final end = math.min(length, offset + chunkSize);
    final bytes = await file.openRead(offset, end).fold<List<int>>(
      <int>[],
      (all, chunk) => all..addAll(chunk),
    );
    return {
      'path': relative,
      'chunk': base64Encode(bytes),
      'offset': offset,
      'size': length,
      'done': end >= length,
    };
  }
}
