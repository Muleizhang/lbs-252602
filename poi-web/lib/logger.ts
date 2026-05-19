export function logRequest(method: string, path: string, status: number, durationMs: number) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${method} ${path} -> ${status} (${durationMs}ms)`);
}
