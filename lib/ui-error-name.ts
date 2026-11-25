/** Short label for a Scan or API failure. Drops request paths and JSON detail. */
export function uiErrorName(message: string): string {
  const jsonAt = message.indexOf("{");
  if (jsonAt >= 0) {
    try {
      const parsed = JSON.parse(message.slice(jsonAt)) as { error?: unknown };
      if (typeof parsed.error === "string") {
        const name = parsed.error.split(":")[0]?.trim();
        if (name) {
          return name;
        }
      }
    } catch {
      // The tail is not a JSON error body.
    }
  }
  const scanDump = /^Scan \d+ on \S+:\s*(.*)$/.exec(message);
  if (scanDump) {
    const rest = scanDump[1]?.trim() ?? "";
    const name = rest.split(":")[0]?.trim();
    return name || "ScanError";
  }
  return message;
}
