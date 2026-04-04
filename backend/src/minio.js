import { Client } from 'minio';
import 'dotenv/config';

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'msxcrm',
  secretKey: process.env.MINIO_SECRET_KEY || 'msxcrm2026Secure!',
});

const BUCKET = process.env.MINIO_BUCKET || 'msxcrm-files';

/** Ensure bucket exists */
export async function ensureBucket() {
  try {
    const exists = await minioClient.bucketExists(BUCKET);
    if (!exists) await minioClient.makeBucket(BUCKET, 'us-east-1');
  } catch (e) {
    console.error('MinIO bucket error:', e.message);
  }
}

/**
 * Upload a Buffer or Stream to MinIO and return the public URL
 * @param {string} objectName - path inside bucket (e.g. 'meta-media/abc123.jpg')
 * @param {Buffer|Stream} data
 * @param {string} contentType
 */
export async function uploadToMinio(objectName, data, contentType = 'application/octet-stream') {
  await minioClient.putObject(BUCKET, objectName, data, { 'Content-Type': contentType });
  // Return public-accessible URL via the API proxy
  const baseUrl = process.env.MINIO_PUBLIC_URL || `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || 9000}`;
  return `${baseUrl}/${BUCKET}/${objectName}`;
}

export { BUCKET };
