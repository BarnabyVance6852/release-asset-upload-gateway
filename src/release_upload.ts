import { z } from "zod";
import { infrai, type PresignedPut } from "./infrai_storage.js";

export const uploadIntentSchema = z.object({
  buildId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  releaseId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  assetName: z.string().min(1).max(160).regex(/^[a-zA-Z0-9._-]+$/),
  contentType: z.enum(["application/zip", "application/gzip", "application/octet-stream"]),
  bytes: z.number().int().positive().max(25 * 1024 * 1024)
}).strict();

export type UploadIntent = z.infer<typeof uploadIntentSchema>;

export type UploadAuthorization = {
  releaseId: string;
  buildId: string;
  objectKey: string;
  upload: { url: string; method: "PUT"; headers: { "Content-Type": string } };
  event: { type: "upload_authorized"; assetName: string; bytes: number };
  diagnostic: string;
};

export function objectKeyFor(input: UploadIntent): string {
  return `releases/${input.releaseId}/builds/${input.buildId}/${input.assetName}`;
}

export function uploadDiagnostic(input: UploadIntent): string {
  const mib = (input.bytes / 1024 / 1024).toFixed(2);
  return `release=${input.releaseId} build=${input.buildId} asset=${input.assetName} size_mib=${mib}`;
}

export async function authorizeReleaseUpload(
  input: UploadIntent,
  bucket: string,
  presign: (bucket: string, key: string, body: {
    op: "put";
    expires_seconds: number;
    content_type: string;
    max_bytes: number;
    idempotency_key: string;
  }) => Promise<PresignedPut> = infrai.storage.object.presign
): Promise<UploadAuthorization> {
  const objectKey = objectKeyFor(input);
  const signed = await presign(bucket, objectKey, {
    op: "put",
    expires_seconds: 600,
    content_type: input.contentType,
    max_bytes: input.bytes,
    idempotency_key: `${input.releaseId}:${input.buildId}:${input.assetName}`
  });

  return {
    releaseId: input.releaseId,
    buildId: input.buildId,
    objectKey,
    upload: { url: signed.url, method: "PUT", headers: { "Content-Type": input.contentType } },
    event: { type: "upload_authorized", assetName: input.assetName, bytes: input.bytes },
    diagnostic: uploadDiagnostic(input)
  };
}
