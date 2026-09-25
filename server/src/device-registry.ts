import type { WebSocket } from "ws";
import type { CommandRequest, CommandResponse, DeviceInfo, DeviceReadyMessage } from "./protocol.js";

interface ConnectedDevice {
  info: DeviceInfo;
  socket: WebSocket;
  pending: Map<string, (response: CommandResponse) => void>;
}

export class DeviceRegistry {
  private readonly devices = new Map<string, ConnectedDevice>();

  register(message: DeviceReadyMessage, socket: WebSocket, ip?: string): DeviceInfo {
    const now = new Date().toISOString();
    const previous = this.devices.get(message.deviceId);
    previous?.socket.close(1000, "replaced by a newer connection");
    const info: DeviceInfo = {
      id: message.deviceId,
      name: message.name,
      platform: message.platform,
      ip: ip ?? message.ip,
      connectedAt: now,
      lastSeenAt: now
    };
    this.devices.set(message.deviceId, { info, socket, pending: new Map() });
    return info;
  }

  setDeviceName(deviceId: string, name: string): boolean {
    const current = this.devices.get(deviceId);
    if (!current) return false;
    current.info.name = name;
    return true;
  }

  unregister(deviceId: string, socket: WebSocket): void {
    const current = this.devices.get(deviceId);
    if (current?.socket !== socket) return;
    for (const resolve of current.pending.values()) {
      resolve({ type: "response", id: "", ok: false, error: "device disconnected" });
    }
    this.devices.delete(deviceId);
  }

  list(): DeviceInfo[] {
    return [...this.devices.values()].map(({ info }) => ({ ...info }));
  }

  get(deviceId: string): ConnectedDevice | undefined {
    const current = this.devices.get(deviceId);
    if (current) current.info.lastSeenAt = new Date().toISOString();
    return current;
  }

  send(deviceId: string, request: CommandRequest, timeoutMs: number): Promise<CommandResponse> {
    const device = this.get(deviceId);
    if (!device || device.socket.readyState !== 1) {
      return Promise.reject(new Error("device is not connected"));
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        device.pending.delete(request.id);
        resolve({ type: "response", id: request.id, ok: false, error: "device command timed out" });
      }, timeoutMs);
      device.pending.set(request.id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
      device.socket.send(JSON.stringify(request), (error) => {
        if (!error) return;
        clearTimeout(timer);
        device.pending.delete(request.id);
        resolve({ type: "response", id: request.id, ok: false, error: error.message });
      });
    });
  }

  acceptResponse(deviceId: string, response: CommandResponse): boolean {
    const device = this.get(deviceId);
    if (!device) return false;
    const resolve = device?.pending.get(response.id);
    if (!resolve) return false;
    device.pending.delete(response.id);
    resolve(response);
    return true;
  }
}
