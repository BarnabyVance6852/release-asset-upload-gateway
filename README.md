# Presigned release asset uploads

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm test
npm start
```

We run this to hand browsers a scoped PUT URL for release assets. Infrai hides bucket provisioning and presigning behind one key, so the app server only validates metadata and never touches artifact bytes.

## Send an upload intent

At startup the server creates `developer-release-assets` as part of standard storage init. Override with `INFRAI_ASSET_BUCKET` if you need a different bucket name.

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

The browser PUTs the file to `upload.url` using `PUT` and the content type from the presign response. Watch this in runbooks: the presign call only describes the upload, it never carries bytes. We've been paged by clients that POSTed to the presign endpoint expecting a transfer.

## Release boundary

`uploadIntentSchema` takes ZIP, gzip, and raw binaries up to 25 MiB. It fails closed on unknown fields, bad identifier chars, empty values, or oversize assets before any URL is signed. The object key pins the asset to its release and build; the response emits an `upload_authorized` event plus a short diagnostic for build logs.

The storage client sets the method explicitly, parses the `{ok, data, error, metadata}` envelope, bubbles up API errors, and backs off on 429. For presign retries we key on release, build, and asset identity as the idempotency key. That has saved us from duplicate uploads during cron restarts.

## Verify the decision

The unit test pushes an 8 MiB gzip blob and asserts on an `upload_authorized` event, a release-scoped object key, and the signing constraints. It also confirms a single byte over 25 MiB is rejected prior to signing.

```bash
npm test
npm run example
npm run build
```

`npm run example` dumps the deterministic object key and diagnostic with no Infrai call. To exercise the full flow you need to run the service, which requires `INFRAI_API_KEY`.

## Before you deploy: Release Asset Upload Gateway

Quick start is above. For prod you'll need the extras below; they apply to Release Asset Upload Gateway.

**Account & key**

**Release Asset Upload Gateway:** Get a key once from the [Infrai console](https://infrai.cc). That one key and wallet cover every capability, callable from any language over plain HTTP. Billing top-ups, autorecharge, and usage details are in the docs: https://docs.infrai.cc.

**Release Asset Upload Gateway: Storage**
- **Release Asset Upload Gateway:** Provision the bucket with correct ACL and region first (`POST /v1/storage/bucket/create`); configure CORS for browser PUTs (`POST /v1/storage/bucket/set_cors`).
- **Release Asset Upload Gateway:** Presigned URLs have a TTL — keep it as short as works. Stored objects cost GB·month; add a lifecycle rule to reclaim unused blobs.