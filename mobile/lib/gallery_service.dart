import 'dart:io';
import 'package:path/path.dart' as p;

class MediaItem {
  const MediaItem({
    required this.file,
    required this.name,
    required this.album,
    required this.modified,
    required this.size,
  });

  final File file;
  final String name;
  final String album;
  final DateTime modified;
  final int size;

  String get path => file.path;

  String get formattedSize {
    if (size < 1024) return '$size B';
    if (size < 1024 * 1024) return '${(size / 1024).toStringAsFixed(1)} KB';
    return '${(size / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

class GalleryService {
  static const Set<String> _imageExtensions = {
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.bmp',
    '.heic',
  };

  static Future<List<MediaItem>> fetchImages() async {
    final results = <MediaItem>[];
    final candidateDirs = <Directory>[];

    if (Platform.isAndroid) {
      const rootPath = '/storage/emulated/0';
      candidateDirs.addAll([
        Directory('$rootPath/DCIM'),
        Directory('$rootPath/Pictures'),
        Directory('$rootPath/Download'),
        Directory('$rootPath/Documents'),
      ]);
    } else {
      // Fallback for desktop/testing
      final home = Platform.environment['USERPROFILE'] ??
          Platform.environment['HOME'] ??
          Directory.current.path;
      candidateDirs.addAll([
        Directory(p.join(home, 'Pictures')),
        Directory(p.join(home, 'Downloads')),
      ]);
    }

    for (final baseDir in candidateDirs) {
      if (!await baseDir.exists()) continue;
      await _scanDirectory(baseDir, results, depth: 0, maxDepth: 4);
    }

    // Sort by modified date descending (newest first)
    results.sort((a, b) => b.modified.compareTo(a.modified));
    return results;
  }

  static Future<void> _scanDirectory(
    Directory dir,
    List<MediaItem> results, {
    required int depth,
    required int maxDepth,
  }) async {
    if (depth > maxDepth) return;

    try {
      await for (final entity in dir.list(followLinks: false)) {
        final name = p.basename(entity.path);
        // Skip hidden files, system caches, and Android app private directories
        if (name.startsWith('.') ||
            name.toLowerCase() == 'cache' ||
            name.toLowerCase() == 'android') {
          continue;
        }

        if (entity is File) {
          final ext = p.extension(name).toLowerCase();
          if (_imageExtensions.contains(ext)) {
            try {
              final stat = await entity.stat();
              final parentName = p.basename(dir.path);
              results.add(MediaItem(
                file: entity,
                name: name,
                album: parentName.isEmpty ? 'Others' : parentName,
                modified: stat.modified,
                size: stat.size,
              ));
            } catch (_) {}
          }
        } else if (entity is Directory) {
          await _scanDirectory(
            entity,
            results,
            depth: depth + 1,
            maxDepth: maxDepth,
          );
        }
      }
    } catch (_) {
      // Ignore permission/read errors for individual directories
    }
  }
}
