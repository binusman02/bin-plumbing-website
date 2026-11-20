import crypto from "crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";

interface ServiceAccountConfig {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedAccessToken: string | null = null;
let cachedTokenExpiryMs = 0;

function loadServiceAccount(): ServiceAccountConfig | null {
  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    const jsonStr = b64
      ? Buffer.from(b64, "base64").toString("utf8")
      : rawJson || "";
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr);
    if (
      typeof parsed?.project_id === "string" &&
      typeof parsed?.client_email === "string" &&
      typeof parsed?.private_key === "string"
    ) {
      return {
        project_id: parsed.project_id,
        client_email: parsed.client_email,
        private_key: parsed.private_key.replace(/\\n/g, "\n"),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getGoogleAccessToken(
  sa: ServiceAccountConfig
): Promise<string | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && Date.now() < cachedTokenExpiryMs - 60_000) {
    return cachedAccessToken;
  }

  try {
    const header = base64UrlEncode(
      JSON.stringify({ alg: "RS256", typ: "JWT" })
    );
    const payload = base64UrlEncode(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: nowSec,
        exp: nowSec + 3600,
      })
    );
    const unsignedJwt = `${header}.${payload}`;
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(unsignedJwt);
    const signature = base64UrlEncode(signer.sign(sa.private_key));
    const assertion = `${unsignedJwt}.${signature}`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;

    cachedAccessToken = data.access_token;
    cachedTokenExpiryMs = Date.now() + (data.expires_in || 3600) * 1000;
    return cachedAccessToken;
  } catch {
    return null;
  }
}

export async function dispatchFcmPush(params: {
  recipientRole: "admin" | "customer" | "plumber";
  recipientId: string;
  title: string;
  body: string;
  destination?: string;
  type?: string;
}): Promise<void> {
  try {
    const sa = loadServiceAccount();
    if (!sa) return;

    const supabase = getServiceSupabase();
    let q = supabase
      .from("device_tokens")
      .select("fcm_token")
      .eq("actor_role", params.recipientRole)
      .eq("is_active", true);

    if (params.recipientRole !== "admin") {
      q = q.eq("actor_id", params.recipientId);
    }

    const { data: rows } = await q;
    const tokens = [
      ...new Set(
        (rows || [])
          .map((r) => String(r.fcm_token || "").trim())
          .filter(Boolean)
      ),
    ];
    if (tokens.length === 0) return;

    const accessToken = await getGoogleAccessToken(sa);
    if (!accessToken) return;

    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    await Promise.all(
      tokens.map(async (token) => {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token,
                notification: {
                  title: params.title,
                  body: params.body,
                },
                data: {
                  destination: params.destination || "",
                  type: params.type || "general",
                },
                android: {
                  priority: "HIGH",
                  notification: {
                    sound: "default",
                    default_sound: true,
                  },
                },
              },
            }),
          });

          if (res.status === 404 || res.status === 410) {
            await supabase
              .from("device_tokens")
              .update({ is_active: false })
              .eq("fcm_token", token);
          }
        } catch {
          // Ignore individual token network errors
        }
      })
    );
  } catch {
    // Non-blocking push delivery
  }
}
