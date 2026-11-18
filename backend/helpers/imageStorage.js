const fs = require('fs');
const path = require('path');
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const REQUIRED_R2_SETTINGS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
];

let client;

function getR2Config() {
  const missing = REQUIRED_R2_SETTINGS.filter((name) => !process.env[name]?.trim());
  const configuredCount = REQUIRED_R2_SETTINGS.length - missing.length;

  if (configuredCount === 0) return null;
  if (missing.length) {
    const error = new Error(`Image storage is not fully configured. Missing: ${missing.join(', ')}`);
    error.code = 'IMAGE_STORAGE_NOT_CONFIGURED';
    throw error;
  }

  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(publicBaseUrl)) {
    const error = new Error('R2_PUBLIC_BASE_URL must be an http or https URL');
    error.code = 'IMAGE_STORAGE_NOT_CONFIGURED';
    throw error;
  }

  return {
    accountId: process.env.R2_ACCOUNT_ID.trim(),
    accessKeyId: process.env.R2_ACCESS_KEY_ID.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME.trim(),
    publicBaseUrl,
  };
}

function requireR2Config() {
  const config = getR2Config();
  if (config) return config;

  const error = new Error(
    `Persistent image storage is not configured. Set ${REQUIRED_R2_SETTINGS.join(', ')} in the backend environment.`
  );
  error.code = 'IMAGE_STORAGE_NOT_CONFIGURED';
  throw error;
}

function persistentStorageRequired() {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    process.env.PERSISTENT_IMAGE_STORAGE_REQUIRED === 'true'
  );
}

function getClient(config) {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return client;
}

function getObjectKey(filename) {
  return `uploads/${path.basename(filename)}`;
}

function getPublicUrl(config, key) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${config.publicBaseUrl}/${encodedKey}`;
}

async function uploadFile(config, filePath, filename, contentType) {
  const key = getObjectKey(filename);
  await getClient(config).send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return getPublicUrl(config, key);
}

async function removeTemporaryUpload(file) {
  if (!file?.path) return;
  try {
    await fs.promises.unlink(file.path);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[image-storage] temporary file cleanup failed:', error.message);
    }
  }
}

async function persistUpload(file) {
  if (!file) return null;

  let config;
  try {
    config = getR2Config();
  } catch (error) {
    await removeTemporaryUpload(file);
    throw error;
  }

  if (!config) {
    if (persistentStorageRequired()) {
      await removeTemporaryUpload(file);
      const error = new Error(
        'Persistent image storage is not configured. Ask an administrator to configure Cloudflare R2 on the backend.'
      );
      error.code = 'IMAGE_STORAGE_NOT_CONFIGURED';
      throw error;
    }
    return `/uploads/${encodeURIComponent(path.basename(file.filename))}`;
  }

  try {
    return await uploadFile(config, file.path, file.filename, file.mimetype);
  } finally {
    await removeTemporaryUpload(file);
  }
}

async function uploadExistingFile(filePath, filename, contentType) {
  const config = requireR2Config();
  return uploadFile(config, filePath, filename, contentType);
}

module.exports = {
  persistUpload,
  removeTemporaryUpload,
  requireR2Config,
  uploadExistingFile,
};
