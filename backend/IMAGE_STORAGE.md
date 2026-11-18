# Persistent image storage

The backend previously saved profile photos, remote-work selfies, and the login cover under `backend/uploads`. That directory is local to the running server and may be cleared when the backend is redeployed or restarted. Cloudflare Pages deployment does not preserve files uploaded to the API server.

The backend now stores new production uploads in Cloudflare R2. Configure these variables on the **backend host** (for example, Render), not in the Cloudflare Pages frontend build:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL` — the public R2 custom-domain base URL, such as `https://images.example.com`
- `PERSISTENT_IMAGE_STORAGE_REQUIRED=true` — recommended on the backend host to prevent silent fallback to ephemeral disk if its runtime does not set `NODE_ENV=production`

Create an R2 bucket, enable public access through a custom domain, and create an R2 API token with read/write access to that bucket. Keep the token secret; never add its values to the frontend or commit them to source control. The `R2_PUBLIC_BASE_URL` must serve objects at paths such as `/uploads/emp_....jpg`.

Local development continues to save files under `backend/uploads` when R2 variables are absent. In production, upload endpoints return an explicit configuration error rather than saving images to non-persistent disk.

## Migrate existing images

Before deploying the new backend, copy any existing files in `backend/uploads` to the same directory on the machine used to run the migration, then set the production database credentials and R2 variables in that environment. From `backend`, run:

```powershell
node scripts/migrateUploadsToR2.js
```

The script uploads files referenced by employee profiles, attendance remote selfies, and the login cover, then updates those database URLs. It leaves references unchanged when a local file is missing and reports each missing file. The files are not deleted from `backend/uploads`.
