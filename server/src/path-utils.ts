export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathValidationError";
  }
}

/**
 * Device paths are always relative POSIX paths. The device independently
 * validates the same rule before joining to its private storage directory.
 */
export function validateRelativePath(value: unknown, allowEmpty = true): string {
  if (typeof value !== "string") {
    throw new PathValidationError("path must be a string");
  }
  if (value.length > 4096 || value.includes("\0")) {
    throw new PathValidationError("path is too long or contains a null byte");
  }
  if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    throw new PathValidationError("path must be a relative POSIX path");
  }
  if (value === "" && allowEmpty) return "";
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new PathValidationError("path contains an invalid segment");
  }
  return segments.join("/");
}
