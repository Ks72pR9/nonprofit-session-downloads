import assert from "node:assert/strict";
import test from "node:test";
import { downloadRequestSchema } from "../src/download_access.js";
import type { InfraiClient } from "../src/infrai.js";
import { issueDownload, MissingDocumentError, PRIVATE_BUCKET } from "../src/nonprofit_download_service.js";

test("a verified session receives a five-minute receipt link", async () => {
  const calls: string[] = [];
  const client = {
    auth: { session: { verify: async (sessionId: string) => { calls.push(`verify:${sessionId}`); } } },
    storage: {
      object: {
        head: async (bucket: string, key: string) => {
          calls.push(`head:${bucket}/${key}`);
          return { found: true };
        },
        presign: async (_bucket: string, key: string, body: { op: "get" | "put"; expires_seconds?: number }) => {
          calls.push(`presign:${key}:${body.op}:${body.expires_seconds}`);
          return { url: "https://download.example/signed" };
        }
      }
    }
  } as unknown as InfraiClient;

  const result = await issueDownload(client, {
    sessionId: "session_42",
    documentType: "donor_receipt",
    recordId: "donation_123"
  });

  assert.deepEqual(calls, [
    "verify:session_42",
    `head:${PRIVATE_BUCKET}/donor-receipts/donation_123.pdf`,
    "presign:donor-receipts/donation_123.pdf:get:300"
  ]);
  assert.equal(result.downloadUrl, "https://download.example/signed");
  assert.equal(result.expiresInSeconds, 300);
});

test("a missing campaign report is never signed", async () => {
  let presigned = false;
  const client = {
    auth: { session: { verify: async () => undefined } },
    storage: {
      object: {
        head: async () => ({ found: false }),
        presign: async () => {
          presigned = true;
          return { url: "https://download.example/unexpected" };
        }
      }
    }
  } as unknown as InfraiClient;

  await assert.rejects(
    issueDownload(client, {
      sessionId: "session_42",
      documentType: "campaign_report",
      recordId: "spring_2026"
    }),
    MissingDocumentError
  );
  assert.equal(presigned, false);
});

test("request validation blocks caller-supplied storage paths", () => {
  const parsed = downloadRequestSchema.safeParse({
    sessionId: "session_42",
    documentType: "donor_receipt",
    recordId: "../../another-file"
  });
  assert.equal(parsed.success, false);
});
