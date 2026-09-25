import 'dart:io';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import 'gallery_service.dart';
import 'photo_viewer_screen.dart';

class GalleryScreen extends StatefulWidget {
  const GalleryScreen({super.key});

  @override
  State<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends State<GalleryScreen> {
  List<MediaItem> _allItems = [];
  List<MediaItem> _displayedItems = [];
  Set<String> _albums = {'All'};
  String _selectedAlbum = 'All';
  bool _isLoading = true;
  bool _hasStoragePermission = true;

  @override
  void initState() {
    super.initState();
    _checkPermissionAndLoad();
  }

  Future<void> _checkPermissionAndLoad() async {
    setState(() => _isLoading = true);

    if (Platform.isAndroid) {
      final manageStatus = await Permission.manageExternalStorage.status;
      final storageStatus = await Permission.storage.status;
      _hasStoragePermission = manageStatus.isGranted || storageStatus.isGranted;

      if (!_hasStoragePermission) {
        final reqManage = await Permission.manageExternalStorage.request();
        final reqStorage = await Permission.storage.request();
        _hasStoragePermission = reqManage.isGranted || reqStorage.isGranted;
      }
    }

    await _loadPhotos();
  }

  Future<void> _loadPhotos() async {
    try {
      final images = await GalleryService.fetchImages();
      final albumSet = <String>{'All'};
      for (final item in images) {
        if (item.album.isNotEmpty) albumSet.add(item.album);
      }

      if (mounted) {
        setState(() {
          _allItems = images;
          _albums = albumSet;
          _filterByAlbum(_selectedAlbum);
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _filterByAlbum(String album) {
    _selectedAlbum = album;
    if (album == 'All') {
      _displayedItems = _allItems;
    } else {
      _displayedItems = _allItems.where((i) => i.album == album).toList();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'View Gallery',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 20,
                color: Colors.white,
              ),
            ),
            if (!_isLoading)
              Text(
                '${_displayedItems.length} photos',
                style: const TextStyle(fontSize: 12, color: Colors.white60),
              ),
          ],
        ),
      ),
      body: Column(
        children: [
          // Album selection chips
          if (_albums.length > 1)
            Container(
              height: 48,
              padding: const EdgeInsets.symmetric(vertical: 6),
              color: const Color(0xFF1E293B),
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: _albums.map((album) {
                  final isSelected = _selectedAlbum == album;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(album),
                      selected: isSelected,
                      onSelected: (selected) {
                        if (selected) {
                          setState(() => _filterByAlbum(album));
                        }
                      },
                      labelStyle: TextStyle(
                        color: isSelected ? Colors.white : Colors.white70,
                        fontSize: 12,
                        fontWeight:
                            isSelected ? FontWeight.bold : FontWeight.normal,
                      ),
                      selectedColor: const Color(0xFF3B82F6),
                      backgroundColor: const Color(0xFF334155),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),

          // Main gallery grid or status views
          Expanded(
            child: _isLoading
                ? const Center(
                    child: CircularProgressIndicator(color: Color(0xFF3B82F6)),
                  )
                : !_hasStoragePermission
                    ? _buildPermissionPrompt()
                    : _displayedItems.isEmpty
                        ? _buildEmptyState()
                        : RefreshIndicator(
                            color: const Color(0xFF3B82F6),
                            backgroundColor: const Color(0xFF1E293B),
                            onRefresh: _loadPhotos,
                            child: GridView.builder(
                              padding: const EdgeInsets.all(4),
                              physics: const AlwaysScrollableScrollPhysics(),
                              gridDelegate:
                                  const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 3,
                                crossAxisSpacing: 4,
                                mainAxisSpacing: 4,
                              ),
                              itemCount: _displayedItems.length,
                              itemBuilder: (context, index) {
                                final item = _displayedItems[index];
                                return GestureDetector(
                                  onTap: () {
                                    Navigator.of(context).push(
                                      MaterialPageRoute(
                                        builder: (_) => PhotoViewerScreen(
                                          items: _displayedItems,
                                          initialIndex: index,
                                        ),
                                      ),
                                    );
                                  },
                                  child: Hero(
                                    tag: 'gallery_image_${item.path}',
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(6),
                                      child: Container(
                                        color: const Color(0xFF1E293B),
                                        child: Image.file(
                                          item.file,
                                          fit: BoxFit.cover,
                                          cacheWidth: 320,
                                          errorBuilder: (context, error, _) =>
                                              const Center(
                                            child: Icon(
                                              Icons.broken_image,
                                              color: Colors.white30,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _buildPermissionPrompt() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.folder_shared_outlined,
              size: 64,
              color: Color(0xFF3B82F6),
            ),
            const SizedBox(height: 16),
            const Text(
              'Storage Access Needed',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Grant storage access to browse photos from your gallery and enable remote file operations.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white60, fontSize: 14),
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF3B82F6),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              icon: const Icon(Icons.lock_open),
              label: const Text('Grant Access'),
              onPressed: _checkPermissionAndLoad,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.photo_library_outlined,
            size: 64,
            color: Colors.white38,
          ),
          const SizedBox(height: 16),
          const Text(
            'No Photos Found',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'No images located in DCIM or Pictures.',
            style: TextStyle(color: Colors.white54, fontSize: 13),
          ),
          const SizedBox(height: 16),
          TextButton.icon(
            icon: const Icon(Icons.refresh, color: Color(0xFF3B82F6)),
            label: const Text(
              'Scan Again',
              style: TextStyle(color: Color(0xFF3B82F6)),
            ),
            onPressed: _checkPermissionAndLoad,
          ),
        ],
      ),
    );
  }
}
