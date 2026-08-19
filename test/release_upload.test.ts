import { describe, expect, it, vi } from "vitest";
import { authorizeReleaseUpload, uploadIntentSchema } from "../src/release_upload.js";

describe("release asset upload policy", () => {
  it("authorizes a bounded build artifact and scopes the signed request", async () => {
    const input = uploadIntentSchema.parse({
      buildId: "build_2048",
      releaseId: "cli-2.4.0",
      assetName: "linux-x64.tar.gz",
      contentType: "application/gzip",
      bytes: 8_388_608
    });
    const presign = vi.fn().mockResolvedValue({ url: "https://uploads.example/signed" });

    const result = await authorizeReleaseUpload(input, "developer-release-assets", presign);

    expect(result.event).toEqual({
      type: "upload_authorized",
      assetName: "linux-x64.tar.gz",
      bytes: 8_388_608
    });
    expect(result.objectKey).toBe("releases/cli-2.4.0/builds/build_2048/linux-x64.tar.gz");
    expect(presign).toHaveBeenCalledWith(
      "developer-release-assets",
      result.objectKey,
      expect.objectContaining({
        op: "put",
        expires_seconds: 600,
        content_type: "application/gzip",
        max_bytes: 8_388_608,
        idempotency_key: "cli-2.4.0:build_2048:linux-x64.tar.gz"
      })
    );
  });

  it("rejects an oversized artifact before a URL can be issued", () => {
    const parsed = uploadIntentSchema.safeParse({
      buildId: "build_2048",
      releaseId: "cli-2.4.0",
      assetName: "linux-x64.tar.gz",
      contentType: "application/gzip",
      bytes: 25 * 1024 * 1024 + 1
    });

    expect(parsed.success).toBe(false);
  });
});
