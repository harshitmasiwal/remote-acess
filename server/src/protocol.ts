export const COMMANDS = [
  "LIST",
  "STAT",
  "DELETE",
  "RENAME",
  "CREATE_DIRECTORY",
  "DOWNLOAD"
] as const;

export type CommandName = (typeof COMMANDS)[number];

export interface CommandRequest {
  type: "command";
  id: string;
  command: CommandName;
  payload: Record<string, unknown>;
}

export interface CommandResponse {
  type: "response";
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface DeviceReadyMessage {
  type: "ready";
  deviceId: string;
  name?: string;
  platform?: string;
}

export interface DeviceInfo {
  id: string;
  name?: string;
  platform?: string;
  connectedAt: string;
  lastSeenAt: string;
}

export function isCommandResponse(value: unknown): value is CommandResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CommandResponse>;
  return candidate.type === "response" &&
    typeof candidate.id === "string" &&
    typeof candidate.ok === "boolean";
}

export function isDeviceReady(value: unknown): value is DeviceReadyMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DeviceReadyMessage>;
  return candidate.type === "ready" && typeof candidate.deviceId === "string";
}
