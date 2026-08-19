import { uploadIntentSchema, uploadDiagnostic, objectKeyFor } from "./release_upload.js";

const input = uploadIntentSchema.parse({
  buildId: "build_2048",
  releaseId: "cli-2.4.0",
  assetName: "linux-x64.tar.gz",
  contentType: "application/gzip",
  bytes: 8_388_608
});

console.log({ objectKey: objectKeyFor(input), diagnostic: uploadDiagnostic(input) });
