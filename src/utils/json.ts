export function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function stringifyEvidence(value: unknown, maxLength = 500): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!text) {
    return "";
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
