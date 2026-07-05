export function getCurrentDate() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    local: now.toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}
