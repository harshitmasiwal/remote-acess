import http from "node:http";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { WebSocketServer, type WebSocket } from "ws";
import { loadConfig, tokenIsValid } from "./config.js";
import { CommandService } from "./command-service.js";
import { DeviceRegistry } from "./device-registry.js";
import { validateRelativePath, PathValidationError } from "./path-utils.js";
import { COMMANDS, isCommandResponse, isDeviceReady, type CommandName } from "./protocol.js";

const config = loadConfig();
const registry = new DeviceRegistry();
const commands = new CommandService(registry, config.commandTimeoutMs);
const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_request, response) => response.json({ ok: true }));
app.get("/api/devices", (_request, response) => response.json({ devices: registry.list() }));

function requireDeviceCommand(command: CommandName, body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("JSON object body required");
  const payload = body as Record<string, unknown>;
  if (command === "RENAME") {
    validateRelativePath(payload.source, false);
    validateRelativePath(payload.destination, false);
  } else {
    validateRelativePath(payload.path);
  }
  return payload;
}

async function sendCommand(request: Request, response: Response, command: CommandName, body: unknown): Promise<void> {
  try {
    const payload = requireDeviceCommand(command, body);
    const deviceId = request.params.id;
    if (typeof deviceId !== "string") throw new Error("device id is required");
    const result = await commands.execute(deviceId, command, payload);
    if (!result.ok) {
      response.status(result.error === "device is not connected" ? 404 : 502).json(result);
      return;
    }
    response.json(result.data ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid request";
    const status = error instanceof PathValidationError || message.includes("JSON object")
      ? 400
      : message === "device is not connected"
        ? 404
        : 500;
    response.status(status).json({ error: message });
  }
}

app.post("/api/devices/:id/list", (request, response) => void sendCommand(request, response, "LIST", request.body));
app.post("/api/devices/:id/stat", (request, response) => void sendCommand(request, response, "STAT", request.body));
app.delete("/api/devices/:id/files", (request, response) => void sendCommand(request, response, "DELETE", request.body));
app.post("/api/devices/:id/rename", (request, response) => void sendCommand(request, response, "RENAME", request.body));
app.post("/api/devices/:id/directories", (request, response) => void sendCommand(request, response, "CREATE_DIRECTORY", request.body));

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "svg": return "image/svg+xml";
    case "mp4": return "video/mp4";
    case "pdf": return "application/pdf";
    case "txt": return "text/plain";
    case "json": return "application/json";
    default: return "application/octet-stream";
  }
}

app.patch("/api/devices/:id", (request, response) => {
  const deviceId = request.params.id;
  const name = request.body?.name;
  if (typeof name !== "string" || !name.trim()) {
    response.status(400).json({ error: "valid name required" });
    return;
  }
  const ok = registry.setDeviceName(deviceId, name.trim());
  if (!ok) {
    response.status(404).json({ error: "device not found" });
    return;
  }
  response.json({ ok: true, name: name.trim() });
});

app.get("/api/devices/:id/download", async (request, response) => {
  try {
    const deviceId = request.params.id;
    if (typeof deviceId !== "string") throw new Error("device id is required");
    const path = validateRelativePath(request.query.path, false);
    let offset = 0;
    let started = false;
    const isInline = request.query.inline === "1" || request.query.inline === "true";
    const mimeType = isInline ? getMimeType(path) : "application/octet-stream";
    const filename = path.split("/").pop() ?? "download";
    response.setHeader("Content-Type", mimeType);
    response.setHeader("Content-Disposition", isInline ? "inline" : `attachment; filename="${filename}"`);
    while (true) {
      const result = await commands.execute(deviceId, "DOWNLOAD", { path, offset, chunkSize: 256 * 1024 });
      if (!result.ok) {
        if (!started) response.status(502).json(result);
        else response.destroy(new Error(result.error));
        return;
      }
      const data = result.data as { chunk?: string; done?: boolean; size?: number } | undefined;
      if (!data || typeof data.chunk !== "string") throw new Error("invalid download response");
      response.write(Buffer.from(data.chunk, "base64"));
      started = true;
      offset += Buffer.from(data.chunk, "base64").length;
      if (data.done) break;
    }
    response.end();
  } catch (error) {
    if (response.headersSent) response.destroy();
    else response.status(400).json({ error: error instanceof Error ? error.message : "download failed" });
  }
});

const server = http.createServer(app);
const webSocketServer = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname !== "/device") {
    socket.destroy();
    return;
  }
  const deviceId = url.searchParams.get("deviceId") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!deviceId || !tokenIsValid(config.deviceTokens, deviceId, token)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  const clientIp = (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || request.socket.remoteAddress || "";
  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, deviceId, clientIp);
  });
});

webSocketServer.on("connection", (socket: WebSocket, deviceId: string, clientIp?: string) => {
  let registered = false;
  socket.on("message", (raw) => {
    try {
      const message: unknown = JSON.parse(raw.toString());
      if (!registered) {
        if (!isDeviceReady(message) || message.deviceId !== deviceId) {
          socket.close(1008, "first message must be ready");
          return;
        }
        registry.register(message, socket, clientIp);
        registered = true;
        socket.send(JSON.stringify({ type: "connected", deviceId, commands: COMMANDS }));
        return;
      }
      if (isCommandResponse(message)) registry.acceptResponse(deviceId, message);
    } catch {
      socket.close(1003, "invalid JSON");
    }
  });
  socket.on("close", () => {
    if (registered) registry.unregister(deviceId, socket);
  });
});

server.listen(config.port, () => {
  console.log(`Remote Storage Bridge server listening on http://localhost:${config.port}`);
});

function shutdown(): void {
  webSocketServer.close();
  server.close(() => process.exit(0));
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
