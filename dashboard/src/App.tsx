import { useCallback, useEffect, useMemo, useState } from "react";

interface Device {
  id: string;
  name?: string;
  platform?: string;
  connectedAt: string;
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

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function App(): JSX.Element {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<ListResponse>({ path: "", entries: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === deviceId),
    [devices, deviceId]
  );

  const loadDevices = useCallback(async () => {
    try {
      const result = await api<{ devices: Device[] }>("/api/devices");
      setDevices(result.devices);
      setDeviceId((current) => current && result.devices.some((device) => device.id === current)
        ? current
        : (result.devices[0]?.id ?? ""));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load devices");
    }
  }, []);

  const loadFiles = useCallback(async (nextPath = "") => {
    if (!deviceId) return;
    setBusy(true);
    setError("");
    try {
      setListing(await api<ListResponse>(`/api/devices/${encodeURIComponent(deviceId)}/list`, {
        method: "POST",
        body: JSON.stringify({ path: nextPath })
      }));
      setPath(nextPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not list files");
    } finally {
      setBusy(false);
    }
  }, [deviceId]);

  useEffect(() => { void loadDevices(); }, [loadDevices]);
  useEffect(() => { if (deviceId) void loadFiles(""); }, [deviceId, loadFiles]);

  async function removeFile(filePath: string): Promise<void> {
    if (!deviceId || !window.confirm(`Delete ${filePath}?`)) return;
    setBusy(true);
    try {
      await api(`/api/devices/${encodeURIComponent(deviceId)}/files`, {
        method: "DELETE",
        body: JSON.stringify({ path: filePath })
      });
      await loadFiles(path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function renameFile(filePath: string): Promise<void> {
    const name = window.prompt("New name", filePath.split("/").pop() ?? "");
    if (!name || !deviceId) return;
    const parent = filePath.includes("/") ? `${filePath.slice(0, filePath.lastIndexOf("/"))}/` : "";
    try {
      await api(`/api/devices/${encodeURIComponent(deviceId)}/rename`, {
        method: "POST",
        body: JSON.stringify({ source: filePath, destination: `${parent}${name}` })
      });
      await loadFiles(path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rename failed");
    }
  }

  async function createDirectory(): Promise<void> {
    const name = window.prompt("Directory name");
    if (!name || !deviceId) return;
    try {
      await api(`/api/devices/${encodeURIComponent(deviceId)}/directories`, {
        method: "POST",
        body: JSON.stringify({ path: path ? `${path}/${name}` : name })
      });
      await loadFiles(path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Create directory failed");
    }
  }

  const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">REMOTE STORAGE BRIDGE</p>
          <h1>Device files</h1>
        </div>
        <button onClick={() => void loadDevices()}>Refresh devices</button>
      </header>
      <section className="toolbar">
        <label>
          Device
          <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
            <option value="">Select a connected device</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>{device.name ?? device.id} ({device.platform ?? "unknown"})</option>
            ))}
          </select>
        </label>
        <span className={selectedDevice ? "status online" : "status"}>{selectedDevice ? "Connected" : "No device"}</span>
      </section>
      {error && <p className="error">{error}</p>}
      <section className="browser">
        <div className="browser-head">
          <code>/{path}</code>
          <div>
            <button disabled={!path || busy} onClick={() => void loadFiles(parentPath)}>Up</button>
            <button disabled={!deviceId || busy} onClick={() => void loadFiles(path)}>Reload</button>
            <button disabled={!deviceId || busy} onClick={() => void createDirectory()}>New folder</button>
          </div>
        </div>
        {busy && <p className="muted">Working...</p>}
        {!busy && listing.entries.length === 0 && <p className="muted">This folder is empty.</p>}
        <ul className="file-list">
          {listing.entries.map((file) => (
            <li key={file.path}>
              <span className="file-name" onClick={() => file.type === "directory" ? void loadFiles(file.path) : undefined}>
                [{file.type === "directory" ? "DIR" : "FILE"}] {file.name}
              </span>
              <span className="file-meta">{file.type === "file" ? `${file.size ?? 0} bytes` : "folder"}</span>
              <span className="actions">
                {file.type === "file" && <a href={`/api/devices/${encodeURIComponent(deviceId)}/download?path=${encodeURIComponent(file.path)}`}>Download</a>}
                <button onClick={() => void renameFile(file.path)}>Rename</button>
                <button className="danger" onClick={() => void removeFile(file.path)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
