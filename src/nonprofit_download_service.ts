import { attachmentName, privateObjectKey, type DownloadRequest } from "./download_access.js";
import type { InfraiClient } from "./infrai.js";

export const PRIVATE_BUCKET = process.env.INFRAI_BUCKET ?? "nonprofit-private-files";

export class MissingDocumentError extends Error {
  constructor() {
    super("The requested document is not available");
    this.name = "MissingDocumentError";
  }
}

export async function issueDownload(
  client: InfraiClient,
  request: DownloadRequest
): Promise<{ downloadUrl: string; expiresInSeconds: number; documentType: DownloadRequest["documentType"] }> {
  await client.auth.session.verify(request.sessionId);

  const key = privateObjectKey(request);
  const object = await client.storage.object.head(PRIVATE_BUCKET, key);
  if (!object.found) throw new MissingDocumentError();

  const expiresInSeconds = 300;
  const signed = await client.storage.object.presign(PRIVATE_BUCKET, key, {
    op: "get",
    expires_seconds: expiresInSeconds,
    response_disposition: `attachment; filename="${attachmentName(request)}"`
  });

  return {
    downloadUrl: signed.url,
    expiresInSeconds,
    documentType: request.documentType
  };
}
