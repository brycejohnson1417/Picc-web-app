export function auditLog(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      event,
      payload,
      at: new Date().toISOString(),
    }),
  );
}
