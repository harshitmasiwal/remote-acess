import { randomUUID } from "node:crypto";
import { validateRelativePath } from "./path-utils.js";
import type { CommandName, CommandResponse } from "./protocol.js";
import { DeviceRegistry } from "./device-registry.js";

export class CommandService {
  constructor(
    private readonly registry: DeviceRegistry,
    private readonly timeoutMs: number
  ) {}

  execute(deviceId: string, command: CommandName, payload: Record<string, unknown>): Promise<CommandResponse> {
    const safePayload = { ...payload };
    if ("path" in safePayload) safePayload.path = validateRelativePath(safePayload.path);
    if ("source" in safePayload) safePayload.source = validateRelativePath(safePayload.source, false);
    if ("destination" in safePayload) safePayload.destination = validateRelativePath(safePayload.destination, false);
    return this.registry.send(deviceId, {
      type: "command",
      id: randomUUID(),
      command,
      payload: safePayload
    }, this.timeoutMs);
  }
}
