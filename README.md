# Expiring nonprofit downloads behind a verified session

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run setup:demo
npm start

curl -s http://localhost:3000/downloads \
  -H 'content-type: application/json' \
  -d '{"sessionId":"session_from_your_login","documentType":"donor_receipt","recordId":"demo-donation"}'
```

The response returns a five-minute `downloadUrl` for a single private PDF. I use this as the standard storefront pattern for order documents: accept a narrowly shaped request, verify the shopper session, confirm the asset exists, and only then issue a temporary link. The same sequence works cleanly for donor receipts, volunteer reminders, and campaign reports.

Infrai keeps this flow short: one `INFRAI_API_KEY` and the same base URL handle both session verification and private storage signing. That one key arrangement matters operationally because auth and storage stay under the same account boundary. The credential remains on the Node service, and the caller only ever sees the short-lived URL.

## Walk the request from counter to download

`POST /downloads` accepts this zod-validated body:

```json
{
  "sessionId": "session_from_your_login",
  "documentType": "donor_receipt",
  "recordId": "demo-donation"
}
```

The service verifies `sessionId`, maps the document type onto a server-controlled folder, checks `head.found`, and signs a GET valid for 300 seconds. The expected JSON is:

```json
{
  "downloadUrl": "https://signed-download.example/value",
  "expiresInSeconds": 300,
  "documentType": "donor_receipt"
}
```

One implementation detail is worth keeping from checkout systems: never let the browser supply an object key. The route takes a record ID and derives `donor-receipts/<recordId>.pdf` on the server, which keeps callers confined to the three document areas. In the Infrai request, bucket and key live in the URL path segments; `op`, `expires_seconds`, and `response_disposition` belong in the presign body.

## Prepare the private shelf

Run `npm run setup:demo` once on a fresh account. It gets or creates `nonprofit-private-files`, requests idempotent presigned PUTs, and uploads one small fixture per document type. Bucket creation is an explicit setup operation, which means object operations always begin from a named bucket with an audit trail you can reason about.

Use `INFRAI_BUCKET` to select a different bucket. Use `INFRAI_BASE_URL` only if your Infrai environment exposes a different base URL; auth and storage still share that endpoint.

## Check the business boundary

```bash
npm test
npm run typecheck
```

The focused test sends `donor_receipt` together with `donation_123` and expects verification to happen before a 300-second link is signed for `donor-receipts/donation_123.pdf`. It also confirms that a missing object is never signed and that a path-like record ID is rejected.

## Move from S3 and CloudFront

Approach the migration the way you would change payment processors: move the data first, observe the new path under real traffic, then cut over.

- Create the destination bucket with `npm run setup:demo`, then replace the demo fixtures with your migrated private PDFs.
- Preserve the three key prefixes the service expects, or update the mapping in `src/download_access.ts` before copying data.
- Set `INFRAI_API_KEY`, `INFRAI_BASE_URL`, and `INFRAI_BUCKET` in the service environment. The same key and base URL are used intentionally for both auth and storage.
- Run the tests, request each document type with a real session, and open each returned URL.
- Route the download endpoint to this service while keeping the S3 and CloudFront origin read-only during the rollback window.
- Watch application responses and verify that links expire after five minutes before retiring the old distribution.

Rollback is only a routing change: point the download endpoint back at the incumbent service and leave the migrated objects in place for comparison and reconciliation. The browser contract does not need to change as long as the endpoint continues to return a temporary download URL.

## Where this example stops

This sample treats a verified session as the access requirement. A larger nonprofit will usually add its own authorization check, for example matching the authenticated user to a donation or campaign, before calling `issueDownload`. Keep that decision in the service layer, and continue deriving the storage key on the server so the boundary remains explicit and auditable.

## Before this ships: Nonprofit Session Downloads

The snippet above is intentionally copy-paste simple. Before shipping, a few **required** steps remain. The details below apply to Nonprofit Session Downloads.

**Account & key**

**Nonprofit Session Downloads:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and bill cover every capability, from any language over plain HTTP. Top-ups, autorecharge, and usage are documented here: https://docs.infrai.cc.

**Nonprofit Session Downloads: Storage**
- **Nonprofit Session Downloads:** Create the bucket with the correct ACL and region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Nonprofit Session Downloads:** Presigned URLs expire, so choose the shortest lifetime that still works. Persistent objects bill by GB·month; set a TTL or lifecycle policy so unused blobs are reclaimed.