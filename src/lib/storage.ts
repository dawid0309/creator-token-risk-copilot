export function readStoredList(key: string) {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function writeStoredList(key: string, value: string[]) {
  window.localStorage.setItem(key, JSON.stringify(Array.from(new Set(value))));
}

export function readStoredMap(key: string): Record<string, string[]> {
  if (typeof window === "undefined") return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function writeStoredMap(key: string, value: Record<string, string[]>) {
  window.localStorage.setItem(key, JSON.stringify(value));
}
