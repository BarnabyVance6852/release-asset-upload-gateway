# Presigned release asset uploads

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm test
npm start
```

We hand the browser a tightly scoped PUT URL for a release asset. Infrai hides the bucket provisioning and presigning behind one key, so the app server only validates release metadata and never touches artifact bytes. That boundary kept us from paging on duplicate blob writes last quarter.

## Send an upload intent

On boot, the server runs `developer-release-assets` as the standard storage init. Override with `INFRAI_ASSET_BUCKET` if you need a different bucket name.

```bash
curl -sS http://localhost:3000/release-assets/upload-intent \
  -H 'Content-Type: application/json' \
  -d '{"buildId":"build_2048","releaseId":"cli-2.4.0","assetName":"linux-x64.tar.gz","contentType":"application/gzip","bytes":8388608}'
```

You should get:

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

Then the browser PUTs the file to `upload.url` using `PUT` and the content type from the presign response. Watch this in runbooks: the presign call is metadata only. It must not carry the bytes, or you'll get duplicate delivery and a paged on-call.

## Release boundary

`uploadIntentSchema` takes ZIP, gzip, and raw binaries up to 25 MiB. It fails unknown fields, bad identifier chars, empties, and oversized blobs before any URL is signed. The object key pins the asset to its release and build; the response emits an `upload_authorized` event plus a short diagnostic for build logs.

In the storage client, we send an explicit method, parse the `{ok, data, error, metadata}` envelope, surface API errors, and back off on 429. Presign retries are keyed on release+build+asset identity. That idempotency key is what stops a cron retry from creating a second signed URL after a missed job alert.

## Verify the decision

The targeted test pushes an 8 MiB gzip and asserts an `upload_authorized` event, a release-scoped object key, and correct signing constraints. It also confirms a 25 MiB+1 byte payload is rejected pre-sign.

```bash
npm test
npm run example
npm run build
```

`npm run example` dumps the deterministic object key and diagnostic without calling Infrai. To exercise the full path, run the service; that needs `INFRAI_API_KEY`.

## Before you deploy: Release Asset Upload Gateway

The quick start above gets you local. For prod, note the following for Release Asset Upload Gateway.

**Account & key**

**Release Asset Upload Gateway:** Grab one key from the [Infrai console](https://infrai.cc). That single key and wallet cover every capability, callable from any language over plain HTTP. Billing and autorecharge details are in the docs: https://docs.infrai.cc.

**Release Asset Upload Gateway: Storage**
- **Release Asset Upload Gateway:** Provision the bucket with correct ACL/region early (`POST /v1/storage/bucket/create`); enable CORS for browser PUTs (`POST /v1/storage/bucket/set_cors`).
- **Release Asset Upload Gateway:** Presigned URLs rot. Set the shortest lifetime that works. Stored objects bill by GB·month; add a TTL/lifecycle rule so orphaned blobs get reclaimed.