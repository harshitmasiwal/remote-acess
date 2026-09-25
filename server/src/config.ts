export interface Config {
  port: number;
  corsOrigin: string;
  deviceTokens: Map<string, string>;
  commandTimeoutMs: number;
}

function parseTokens(): Map<string, string> {
  const result = new Map<string, string>();
  const json = process.env.DEVICE_TOKENS;
  if (json) {
    try {
      const values: unknown = JSON.parse(json);
      if (values && typeof values === "object" && !Array.isArray(values)) {
        for (const [deviceId, token] of Object.entries(values)) {
          if (typeof token === "string" && token.length >= 8) result.set(deviceId, token);
        }
      }
    } catch {
      console.warn("DEVICE_TOKENS is not valid JSON; ignoring it");
    }
  }
  if (result.size === 0) result.set("*", process.env.DEVICE_TOKEN ?? "local-dev-token");
  return result;
}

export function loadConfig(): Config {
  const port = Number(process.env.PORT ?? 3000);
  return {
    port: Number.isInteger(port) && port > 0 ? port : 3000,
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    deviceTokens: parseTokens(),
    commandTimeoutMs: Number(process.env.COMMAND_TIMEOUT_MS ?? 30_000)
  };
}

export function tokenIsValid(tokens: Map<string, string>, deviceId: string, token: string): boolean {
  const expected = tokens.get(deviceId) ?? tokens.get("*");
  return Boolean(expected && token && expected === token);
}
