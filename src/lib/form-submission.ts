export function createJsonFormData(payload: unknown) {
  const formData = new FormData();
  formData.set("payload", JSON.stringify(payload));
  return formData;
}

export function appendOptionalFile(formData: FormData, key: string, file?: File | null) {
  if (file) {
    formData.set(key, file);
  }
}

export function appendBooleanFlag(formData: FormData, key: string, value: boolean) {
  if (value) {
    formData.set(key, "1");
  }
}
