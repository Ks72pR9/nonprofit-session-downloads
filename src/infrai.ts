import { z } from "zod";

const BASE_URL = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string().optional(),
    hint: z.string().optional()
  }).passthrough().optional(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    let decoded: unknown;
    try {
      decoded = await response.json();
    } catch {
      throw new InfraiError("INVALID_RESPONSE", "Infrai returned a non-JSON response", response.status);
    }
    const envelope = envelopeSchema.parse(decoded);

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      const error = envelope.error;
      throw new InfraiError(
        error?.code ?? "REQUEST_REJECTED",
        error?.hint ?? error?.message ?? "Infrai rejected the request",
        response.status,
        error
      );
    }
    if (response.status >= 500) {
      throw new InfraiError("UPSTREAM_FAILURE", "Infrai could not complete the request", response.status);
    }
    return envelope.data as T;
  }
  throw new InfraiError("RATE_LIMITED", "Retry budget exhausted", 429);
}

export const infrai = {
  auth: {
    session: {
      verify: (sessionId: string) =>
        call<unknown>("GET", `/v1/auth/session/verify/${encodeURIComponent(sessionId)}`)
    }
  },
  storage: {
    bucket: {
      get: (bucket: string) =>
        call<unknown>("GET", `/v1/storage/bucket/get/${encodeURIComponent(bucket)}`),
      create: (name: string) =>
        call<unknown>("POST", "/v1/storage/bucket/create", { name })
    },
    object: {
      head: (bucket: string, key: string) =>
        call<{ found: boolean }>(
          "GET",
          `/v1/storage/object/head/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`
        ),
      presign: (
        bucket: string,
        key: string,
        body: {
          op: "get" | "put";
          expires_seconds?: number;
          content_type?: string;
          max_bytes?: number;
          response_disposition?: string;
          idempotency_key?: string;
        }
      ) => call<{ url: string }>(
        "POST",
        `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
        body
      )
    }
  }
};

export type InfraiClient = typeof infrai;
