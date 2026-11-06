import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { downloadRequestSchema } from "./download_access.js";
import { infrai, InfraiError } from "./infrai.js";
import { issueDownload, MissingDocumentError } from "./nonprofit_download_service.js";

const port = Number(process.env.PORT ?? 3000);

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 16_384) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/downloads") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const input = downloadRequestSchema.parse(await readJson(request));
    sendJson(response, 200, await issueDownload(infrai, input));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid request body" });
      return;
    }
    if (error instanceof MissingDocumentError) {
      sendJson(response, 404, { error: error.message });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(response, status, { error: error.message, code: error.code });
      return;
    }
    sendJson(response, 500, { error: "Could not prepare the download" });
  }
});

server.listen(port, () => {
  console.log(`Private download service listening on http://localhost:${port}`);
});
