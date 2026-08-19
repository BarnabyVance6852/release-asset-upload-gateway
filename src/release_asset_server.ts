import { createServer } from "node:http";
import { ZodError } from "zod";
import { infrai } from "./infrai_storage.js";
import { authorizeReleaseUpload, uploadIntentSchema } from "./release_upload.js";

const bucket = process.env.INFRAI_ASSET_BUCKET ?? "developer-release-assets";
const port = Number(process.env.PORT ?? 3000);
const bucketReady = infrai.storage.bucket.create(bucket);

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/release-assets/upload-intent") {
    json(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const input = uploadIntentSchema.parse(await readJson(request));
    await bucketReady;
    json(response, 201, await authorizeReleaseUpload(input, bucket));
  } catch (error) {
    if (error instanceof ZodError) {
      json(response, 400, { error: "Invalid upload intent", issues: error.issues });
      return;
    }
    console.error(error);
    json(response, 502, { error: "Upload authorization failed" });
  }
});

server.listen(port, () => console.log(`release asset service listening on http://localhost:${port}`));
