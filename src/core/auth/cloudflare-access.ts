import { ApiError } from "@/core/errors/api-error";
import type { Env } from "@/worker/env";

interface AccessClaims {
  aud: string | string[];
  email?: string;
  exp: number;
  iss: string;
  sub: string;
}

interface JsonWebKeyWithKid extends JsonWebKey {
  kid: string;
}

const keyCache = new Map<string, { expiresAt: number; keys: JsonWebKeyWithKid[] }>();

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseSegment<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment))) as T;
}

async function getKeys(teamDomain: string): Promise<JsonWebKeyWithKid[]> {
  const cached = keyCache.get(teamDomain);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new ApiError(503, "ACCESS_CONFIGURATION_MISSING", "無法取得Cloudflare Access驗證金鑰。");
  const body = (await response.json()) as { keys: JsonWebKeyWithKid[] };
  keyCache.set(teamDomain, { keys: body.keys, expiresAt: Date.now() + 60 * 60 * 1000 });
  return body.keys;
}

export async function requireAccess(request: Request, env: Env): Promise<{ actorId: string; email: string | null }> {
  if (env.ENVIRONMENT === "local" || env.ENVIRONMENT === "test") {
    return { actorId: request.headers.get("x-local-access-user") ?? "local-owner", email: null };
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new ApiError(503, "ACCESS_CONFIGURATION_MISSING", "Cloudflare Access驗證尚未設定。");
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new ApiError(401, "ACCESS_UNAUTHORIZED", "請先通過Cloudflare Access驗證。");
  const segments = token.split(".");
  if (segments.length !== 3) throw new ApiError(401, "ACCESS_UNAUTHORIZED", "Access憑證格式無效。");
  const header = parseSegment<{ alg: string; kid: string }>(segments[0]);
  const claims = parseSegment<AccessClaims>(segments[1]);
  if (header.alg !== "RS256") throw new ApiError(401, "ACCESS_UNAUTHORIZED", "Access憑證簽章演算法無效。");
  const keyData = (await getKeys(env.ACCESS_TEAM_DOMAIN)).find((key) => key.kid === header.kid);
  if (!keyData) throw new ApiError(401, "ACCESS_UNAUTHORIZED", "找不到Access憑證簽章金鑰。");
  const key = await crypto.subtle.importKey(
    "jwk",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(segments[2]),
    new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
  );
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const expectedIssuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  if (
    !valid ||
    claims.exp * 1000 <= Date.now() ||
    !audiences.includes(env.ACCESS_AUD) ||
    claims.iss.replace(/\/$/, "") !== expectedIssuer.replace(/\/$/, "")
  ) {
    throw new ApiError(401, "ACCESS_UNAUTHORIZED", "Access憑證已失效或不屬於此應用程式。");
  }
  if (env.ACCESS_ALLOWED_EMAIL && claims.email?.toLowerCase() !== env.ACCESS_ALLOWED_EMAIL.toLowerCase()) {
    throw new ApiError(403, "ACCESS_UNAUTHORIZED", "此身分不在允許名單中。");
  }
  return { actorId: claims.sub, email: claims.email ?? null };
}
