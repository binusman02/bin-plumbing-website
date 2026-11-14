import crypto from "crypto";

export const CUSTOMER_SESSION_COOKIE = "bin_customer_session";
export const PLUMBER_SESSION_COOKIE = "bin_plumber_session";

function getSessionSecret(): string {
  const secret =
    process.env.AUTH_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing AUTH_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY in production."
    );
  }
  return `dev-ephemeral-${process.pid}-${process.cwd()}`;
}

export function hashCustomerPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyCustomerPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function signSessionToken(subjectId: string, role: "customer" | "plumber"): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: subjectId,
      role,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

function verifySessionToken(
  token: string | undefined,
  expectedRole: "customer" | "plumber"
): { id: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      parsed?.role !== expectedRole ||
      typeof parsed?.sub !== "string" ||
      typeof parsed?.exp !== "number" ||
      parsed.exp < Date.now()
    ) {
      return null;
    }
    return { id: parsed.sub };
  } catch {
    return null;
  }
}

export function signCustomerSessionToken(customerId: string): string {
  return signSessionToken(customerId, "customer");
}

export function verifyCustomerSessionToken(
  token: string | undefined
): { customerId: string } | null {
  const res = verifySessionToken(token, "customer");
  return res ? { customerId: res.id } : null;
}

export function signPlumberSessionToken(accountId: string): string {
  return signSessionToken(accountId, "plumber");
}

export function verifyPlumberSessionToken(
  token: string | undefined
): { accountId: string } | null {
  const res = verifySessionToken(token, "plumber");
  return res ? { accountId: res.id } : null;
}
