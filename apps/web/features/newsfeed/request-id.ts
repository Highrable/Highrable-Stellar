export function createNewsfeedRequestId() {
  // Available even when the browser restricts randomUUID() to secure contexts.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
