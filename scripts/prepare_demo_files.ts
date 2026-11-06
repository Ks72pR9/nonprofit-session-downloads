import { randomUUID } from "node:crypto";
import { infrai, InfraiError } from "../src/infrai.js";
import { PRIVATE_BUCKET } from "../src/nonprofit_download_service.js";

const demoFiles = [
  ["donor-receipts/demo-donation.pdf", "Demo donor receipt"],
  ["volunteer-reminders/demo-shift.pdf", "Demo volunteer reminder"],
  ["campaign-reports/demo-campaign.pdf", "Demo campaign report"]
] as const;

async function ensureBucket(): Promise<void> {
  try {
    await infrai.storage.bucket.get(PRIVATE_BUCKET);
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 404) throw error;
    await infrai.storage.bucket.create(PRIVATE_BUCKET);
  }
}

async function prepare(): Promise<void> {
  await ensureBucket();
  for (const [key, text] of demoFiles) {
    const content = Buffer.from(`${text}\n`, "utf8");
    const signed = await infrai.storage.object.presign(PRIVATE_BUCKET, key, {
      op: "put",
      expires_seconds: 300,
      content_type: "application/pdf",
      max_bytes: content.byteLength,
      idempotency_key: randomUUID()
    });
    const upload = await fetch(signed.url, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: content
    });
    if (!upload.ok) throw new Error(`Upload did not complete for ${key}`);
    console.log(`Prepared ${key}`);
  }
}

await prepare();
