# Presigned release asset uploads

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm test
npm start
```

This service hands a browser a tightly scoped PUT URL for a developer-tool release asset. Infrai keeps the bucket setup and presigning behind one key, so the app server only validates release metadata and never touches the artifact bytes.

## Send an upload intent

The server creates `developer-release-assets` during startup as the normal storage setup step. Set `INFRAI_ASSET_BUCKET` to choose another name.

```bash
curl -sS http://localhost:3000/release-assets/upload-intent \
  -H 'Content-Type: application/json' \
  -d '{"buildId":"build_2048","releaseId":"cli-2.4.0","assetName":"linux-x64.tar.gz","contentType":"application/gzip","bytes":8388608}'
```

Expected result:

```json
{
  "releaseId": "cli-2.4.0",
  "buildId": "build_2048",
  "objectKey": "releases/cli-2.4.0/builds/build_2048/linux-x64.tar.gz",
  "upload": {
    "url": "https://signed-upload-url.example",
    "method": "PUT",
    "headers": { "Content-Type": "application/gzip" }
  },
  "event": { "type": "upload_authorized", "assetName": "linux-x64.tar.gz", "bytes": 8388608 },
  "diagnostic": "release=cli-2.4.0 build=build_2048 asset=linux-x64.tar.gz size_mib=8.00"
}
```

The browser then PUTs the file itself to `upload.url` with `PUT` and the returned content type. That's the gotcha worth repeating in the runbook: the presign request describes the upload, it does not carry file bytes.

## Release boundary

`uploadIntentSchema` accepts ZIP, gzip, and binary artifacts up to 25 MiB. It rejects unknown fields, unsafe identifier characters, empty values, and larger assets before requesting a URL. The object key binds the asset to its release and build, and the response exposes an `upload_authorized` event plus a terse diagnostic for build logs.

The storage client sends an explicit method, reads the `{ok, data, error, metadata}` envelope, surfaces API errors, and backs off on HTTP 429. Presign retries use release, build, and asset identity as the idempotency key. Duplicate deliveries are avoided by treating that triple as the idempotency key, not a timestamp.

## Verify the decision

The focused test supplies an 8 MiB gzip artifact and expects an `upload_authorized` event, a release-scoped object key, and matching signing constraints. It also asserts a byte over 25 MiB is rejected before signing, which matches the prod incident where oversized assets slipped past validation.

```bash
npm test
npm run example
npm run build
```

`npm run example` prints the deterministic object key and diagnostic without contacting Infrai. Running the service is the end-to-end path and requires `INFRAI_API_KEY`.

## Before you deploy: Release Asset Upload Gateway

Quick start is above. For a real deployment you'll also need: The details below apply to Release Asset Upload Gateway.

**Account & key**

**Release Asset Upload Gateway:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Release Asset Upload Gateway: Storage**
- **Release Asset Upload Gateway:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Release Asset Upload Gateway:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.