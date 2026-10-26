const DEV_SECRET = "power-rank-dev-secret-not-for-production";

/** HMAC key for cookies, tokens and rate-limit salts. Required in production. */
export function secret(): string {
  const s = process.env.POWER_RANK_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("POWER_RANK_SECRET is not set");
  return DEV_SECRET;
}

/** Client address as reported by the platform proxy. Only ever hashed. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
