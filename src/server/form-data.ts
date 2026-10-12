export function parseJsonFormData(formData: FormData) {
  const rawPayload = formData.get("payload");
  if (typeof rawPayload !== "string") {
    throw new Error("Invalid form submission.");
  }

  try {
    return JSON.parse(rawPayload) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid form submission.");
  }
}

export function getOptionalFile(formData: FormData, key: string) {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size === 0) {
    return undefined;
  }

  return value;
}

export function getBooleanFlag(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "1" || value === "true";
}

export function parseOptionalDate(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
