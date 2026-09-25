import { useCallback, useEffect, useMemo, useState } from "react";

interface Device {
  id: string;
  name?: string;
  platform?: string;
  ip?: string;
  connectedAt: string;
  lastSeenAt: string;
}

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: string;
}

interface ListResponse {
  path: string;
  entries: FileEntry[];
}

interface ToastMessage {
  id: number;
  text: string;
  type: "success" | "error" | "info";
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "svg"].includes(ext);
}

export function App(): JSX.Element {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [path, setPath] = useState<string>("");
  const [listing, setListing] = useState<ListResponse>({ path: "", entries: [] });
  const [busy, setBusy] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, type: "success" | "error" | "info" = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === deviceId),
    [devices, deviceId]
  );

  // Load connected devices from server
  const loadDevices = useCallback(async () => {
    try {
      const result = await api<{ devices: Device[] }>("/api/devices");
      setDevices(result.devices);
      // Auto-select first device or maintain current selection
      setDeviceId((current) => {
        if (current && result.devices.some((d) => d.id === current)) {
          return current;
        }
        return result.devices[0]?.id ?? "";
      });
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Failed to load devices", "error");
    }
  }, [showToast]);

  // Load files for selected device and path
  const loadFiles = useCallback(async (nextPath = "") => {
    if (!deviceId) return;
    setBusy(true);
    try {
      const data = await api<ListResponse>(`/api/devices/${encodeURIComponent(deviceId)}/list`, {
        method: "POST",
        body: JSON.stringify({ path: nextPath })
      });
      setListing(data);
      setPath(nextPath);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Could not list files", "error");
    } finally {
      setBusy(false);
    }
  }, [deviceId, showToast]);

  // Initial load and periodic background poll for connected devices (every 3 seconds)
  useEffect(() => {
    void loadDevices();
    const interval = setInterval(() => {
      void loadDevices();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadDevices]);

  // When selected device changes, reload files at root
  useEffect(() => {
    if (deviceId) {
      void loadFiles("");
    } else {
      setListing({ path: "", entries: [] });
      setPath("");
    }
  }, [deviceId, loadFiles]);

  // Rename Device Alias
  const handleRenameDevice = async (targetDeviceId: string, currentName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const newName = window.prompt("Enter new device name:", currentName);
    if (!newName || newName.trim() === currentName) return;

    try {
      await api(`/api/devices/${encodeURIComponent(targetDeviceId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName.trim() })
      });
      showToast(`Device renamed to "${newName.trim()}"`, "success");
      await loadDevices();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Failed to rename device", "error");
    }
  };

  // Delete file or folder
  async function removeFile(filePath: string, event?: React.MouseEvent): Promise<void> {
    event?.stopPropagation();
    if (!deviceId || !window.confirm(`Are you sure you want to delete ${filePath}?`)) return;
    setBusy(true);
    try {
      await api(`/api/devices/${encodeURIComponent(deviceId)}/files`, {
        method: "DELETE",
        body: JSON.stringify({ path: filePath })
      });
      showToast(`Deleted ${filePath.split("/").pop()}`, "success");
      await loadFiles(path);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Delete failed", "error");
    } finally {
      setBusy(false);
    }
  }

  // Rename file
  async function renameFile(filePath: string, event?: React.MouseEvent): Promise<void> {
    event?.stopPropagation();
    const currentName = filePath.split("/").pop() ?? "";
    const name = window.prompt("Rename file to:", currentName);
    if (!name || name === currentName || !deviceId) return;

    const parent = filePath.includes("/") ? `${filePath.slice(0, filePath.lastIndexOf("/"))}/` : "";
    setBusy(true);
    try {
      await api(`/api/devices/${encodeURIComponent(deviceId)}/rename`, {
        method: "POST",
        body: JSON.stringify({ source: filePath, destination: `${parent}${name}` })
      });
      showToast(`Renamed to ${name}`, "success");
      await loadFiles(path);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Rename failed", "error");
    } finally {
      setBusy(false);
    }
  }

  // Create new directory
  async function createDirectory(): Promise<void> {
    const name = window.prompt("Enter new directory name:");
    if (!name || !deviceId) return;
    setBusy(true);
    try {
      await api(`/api/devices/${encodeURIComponent(deviceId)}/directories`, {
        method: "POST",
        body: JSON.stringify({ path: path ? `${path}/${name}` : name })
      });
      showToast(`Folder "${name}" created`, "success");
      await loadFiles(path);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Create directory failed", "error");
    } finally {
      setBusy(false);
    }
  }

  // Breadcrumbs navigation
  const breadcrumbSegments = useMemo(() => {
    if (!path) return [];
    return path.split("/").filter(Boolean);
  }, [path]);

  const navigateToBreadcrumb = (index: number) => {
    if (index === -1) {
      void loadFiles("");
      return;
    }
    const target = breadcrumbSegments.slice(0, index + 1).join("/");
    void loadFiles(target);
  };

  // Filtered entries by search query
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return listing.entries;
    const query = searchQuery.toLowerCase();
    return listing.entries.filter((entry) => entry.name.toLowerCase().includes(query));
  }, [listing.entries, searchQuery]);

  return (
    <div className="dashboard-container">
      {/* Dashboard Header */}
      <header className="dashboard-header">
        <div className="logo-area">
          <div className="logo-icon">📱</div>
          <div className="logo-text">
            <p>Remote Storage Bridge</p>
            <h1>Device Hub</h1>
          </div>
        </div>

        <div className="header-actions">
          <div className="badge badge-emerald">
            <span className="badge-pulse-dot" />
            <span>{devices.length} {devices.length === 1 ? "Device" : "Devices"} Online</span>
          </div>

          <button className="btn" onClick={() => void loadDevices()}>
            🔄 Refresh
          </button>
        </div>
      </header>

      {/* Connected Devices Grid */}
      <section className="devices-section">
        <div className="section-title-row">
          <h2 className="section-title">Connected Devices</h2>
          <span className="badge badge-amber">Live In-Memory (No Stale Storage)</span>
        </div>

        {devices.length === 0 ? (
          <div className="empty-devices-banner">
            <h3>No Devices Connected</h3>
            <p>Open the <strong>View Gallery</strong> app on your Android phones with the server link to connect them.</p>
          </div>
        ) : (
          <div className="device-cards-grid">
            {devices.map((device) => {
              const isSelected = device.id === deviceId;
              return (
                <div
                  key={device.id}
                  className={`device-card ${isSelected ? "active" : ""}`}
                  onClick={() => setDeviceId(device.id)}
                >
                  <div className="device-card-header">
                    <div className="device-avatar-wrap">
                      <div className="device-avatar">📱</div>
                      <div className="device-title-area">
                        <span className="device-name">
                          {device.name ?? device.id}
                          <button
                            className="device-edit-btn"
                            title="Rename device nickname"
                            onClick={(e) => void handleRenameDevice(device.id, device.name ?? device.id, e)}
                          >
                            ✏️
                          </button>
                        </span>
                        <span className="device-id-badge">{device.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="device-meta-row">
                    <span>OS: {device.platform ?? "Android"}</span>
                    <span>{isSelected ? "Active View" : "Click to Browse"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Device Storage Browser */}
      {selectedDevice && (
        <section className="browser-section">
          {/* Top Bar with Breadcrumbs & Actions */}
          <div className="browser-topbar">
            <div className="breadcrumbs">
              <span
                className={`breadcrumb-item ${!path ? "active" : ""}`}
                onClick={() => navigateToBreadcrumb(-1)}
              >
                Root
              </span>
              {breadcrumbSegments.map((segment, index) => {
                const isLast = index === breadcrumbSegments.length - 1;
                return (
                  <span key={segment} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span className="breadcrumb-separator">/</span>
                    <span
                      className={`breadcrumb-item ${isLast ? "active" : ""}`}
                      onClick={() => !isLast && navigateToBreadcrumb(index)}
                    >
                      {segment}
                    </span>
                  </span>
                );
              })}
            </div>

            <div className="browser-controls">
              {path && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
                    void loadFiles(parent);
                  }}
                >
                  ⬆️ Up
                </button>
              )}
              <button className="btn" disabled={busy} onClick={() => void loadFiles(path)}>
                🔄 Reload
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void createDirectory()}>
                📁 New Folder
              </button>
            </div>
          </div>

          {/* Search & View Mode Bar */}
          <div className="browser-filterbar">
            <div className="search-input-wrap">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search files in current folder..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>

            <div className="view-mode-toggle">
              <button
                className={`view-mode-btn ${viewMode === "grid" ? "active" : ""}`}
                onClick={() => setViewMode("grid")}
              >
                🖼️ Gallery Grid
              </button>
              <button
                className={`view-mode-btn ${viewMode === "table" ? "active" : ""}`}
                onClick={() => setViewMode("table")}
              >
                📋 List View
              </button>
            </div>
          </div>

          {/* Content Area */}
          {busy ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)" }}>
              <p>Loading files from {selectedDevice.name ?? selectedDevice.id}...</p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)" }}>
              <p>{searchQuery ? "No matching files found." : "This folder is empty."}</p>
            </div>
          ) : viewMode === "grid" ? (
            /* Gallery Grid View */
            <div className="gallery-grid">
              {filteredEntries.map((file) => {
                const isImage = isImageFile(file.name);
                const isDir = file.type === "directory";
                const downloadUrl = `/api/devices/${encodeURIComponent(deviceId)}/download?path=${encodeURIComponent(file.path)}`;

                return (
                  <div
                    key={file.path}
                    className="gallery-card"
                    onClick={() => {
                      if (isDir) {
                        void loadFiles(file.path);
                      } else if (isImage) {
                        setPreviewImage(`${downloadUrl}&inline=1`);
                      }
                    }}
                  >
                    <div className="gallery-thumb-wrap">
                      {isDir ? (
                        <div className="gallery-folder-thumb">📁</div>
                      ) : isImage ? (
                        <img
                          src={`${downloadUrl}&inline=1`}
                          alt={file.name}
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="gallery-file-thumb">📄</div>
                      )}
                    </div>

                    <div className="gallery-info">
                      <div className="gallery-file-name" title={file.name}>
                        {file.name}
                      </div>
                      <div className="gallery-meta">
                        {isDir ? "Folder" : formatSize(file.size)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table / List View */
            <table className="file-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Modified</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((file) => {
                  const isDir = file.type === "directory";
                  const isImage = isImageFile(file.name);
                  const downloadUrl = `/api/devices/${encodeURIComponent(deviceId)}/download?path=${encodeURIComponent(file.path)}`;

                  return (
                    <tr key={file.path} className="file-row">
                      <td className="file-cell">
                        <div
                          className="file-name-cell"
                          onClick={() => {
                            if (isDir) void loadFiles(file.path);
                            else if (isImage) setPreviewImage(`${downloadUrl}&inline=1`);
                          }}
                        >
                          <div className={`file-icon ${isDir ? "folder" : isImage ? "image" : "doc"}`}>
                            {isDir ? "📁" : isImage ? "🖼️" : "📄"}
                          </div>
                          <span className="file-title">{file.name}</span>
                        </div>
                      </td>
                      <td className="file-cell" style={{ color: "var(--text-muted)" }}>
                        {isDir ? "Folder" : formatSize(file.size)}
                      </td>
                      <td className="file-cell" style={{ color: "var(--text-muted)" }}>
                        {file.modifiedAt ? new Date(file.modifiedAt).toLocaleString() : "--"}
                      </td>
                      <td className="file-cell">
                        <div className="file-row-actions">
                          {isImage && (
                            <button
                              className="btn btn-icon-only"
                              title="Preview Image"
                              onClick={() => setPreviewImage(`${downloadUrl}&inline=1`)}
                            >
                              👁️
                            </button>
                          )}
                          {!isDir && (
                            <a
                              href={downloadUrl}
                              className="btn btn-icon-only"
                              title="Download"
                              style={{ textDecoration: "none" }}
                            >
                              ⬇️
                            </a>
                          )}
                          <button
                            className="btn btn-icon-only"
                            title="Rename"
                            onClick={(e) => void renameFile(file.path, e)}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn btn-icon-only btn-danger"
                            title="Delete"
                            onClick={(e) => void removeFile(file.path, e)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* Lightbox Image Preview Modal */}
      {previewImage && (
        <div className="lightbox-overlay" onClick={() => setPreviewImage(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close-btn" onClick={() => setPreviewImage(null)}>
              ✕
            </button>
            <img src={previewImage} alt="Preview" className="lightbox-image" />
            <div className="lightbox-controls">
              <a
                href={previewImage.replace("&inline=1", "")}
                download
                className="btn btn-primary"
                style={{ textDecoration: "none" }}
              >
                ⬇️ Download Full Image
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "⚠️" : "ℹ️"}</span>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
