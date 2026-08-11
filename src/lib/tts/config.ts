/** A TTS server may run locally or on another machine on the same LAN. */
export function isSafeTtsServerHost(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const host = value.trim();
  if (host === "localhost") return true;
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return false;
  return octets[0] === 127
    || octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function ttsServerHost(value: unknown): string {
  return isSafeTtsServerHost(value) ? value.trim() : "127.0.0.1";
}
