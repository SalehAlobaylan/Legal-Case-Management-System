import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

interface IStorageService {
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}

class LocalStorageProvider implements IStorageService {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  async upload(key: string, buffer: Buffer, _contentType: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buffer);
  }

  async download(key: string): Promise<Buffer> {
    // Support legacy absolute paths stored in DB before this migration
    if (path.isAbsolute(key) && fs.existsSync(key)) {
      return fs.promises.readFile(key);
    }
    return fs.promises.readFile(path.join(this.baseDir, key));
  }

  async delete(key: string): Promise<void> {
    const filePath = path.isAbsolute(key) ? key : path.join(this.baseDir, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  getPublicUrl(key: string): string {
    return `/uploads/${key}`;
  }
}

async function readableToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

class S3StorageProvider implements IStorageService {
  private client: S3Client;
  private bucket: string;
  private publicUrlBase: string;

  constructor(config: {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
    region: string;
    publicUrlBase: string;
    forcePathStyle: boolean;
  }) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
    this.bucket = config.bucket;
    this.publicUrlBase = config.publicUrlBase.replace(/\/$/, "");
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    return readableToBuffer(response.Body as Readable);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrlBase}/${key}`;
  }
}

let _instance: IStorageService | null = null;

export function getStorageService(): IStorageService {
  if (_instance) return _instance;

  const provider = (process.env.STORAGE_PROVIDER || "local").toLowerCase();

  if (provider === "minio") {
    const endpoint = process.env.MINIO_ENDPOINT || "http://localhost:9000";
    const bucket = process.env.MINIO_BUCKET || "silah-legal";
    _instance = new S3StorageProvider({
      endpoint,
      accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
      bucket,
      region: process.env.MINIO_REGION || "us-east-1",
      // MinIO path-style URL: http://host/bucket/key
      publicUrlBase: `${endpoint}/${bucket}`,
      forcePathStyle: true,
    });
  } else if (provider === "s3") {
    _instance = new S3StorageProvider({
      endpoint: process.env.S3_ENDPOINT || "",
      accessKey: process.env.S3_ACCESS_KEY || "",
      secretKey: process.env.S3_SECRET_KEY || "",
      bucket: process.env.S3_BUCKET || "silah-legal",
      region: process.env.S3_REGION || "auto",
      publicUrlBase: process.env.S3_PUBLIC_URL || "",
      forcePathStyle: false,
    });
  } else {
    _instance = new LocalStorageProvider(process.env.UPLOAD_DIR || "./uploads");
  }

  return _instance;
}

/**
 * Extracts the storage key from a stored URL or path.
 *
 * Handles three formats:
 *   - Local URL:   /uploads/client-documents/uuid.pdf  → client-documents/uuid.pdf
 *   - MinIO URL:   http://host/bucket/key              → key
 *   - R2/S3 URL:   https://domain/key                 → key
 */
export function resolveStorageKey(fileUrl: string): string {
  if (!fileUrl) return fileUrl;

  if (fileUrl.startsWith("/uploads/")) {
    return fileUrl.substring("/uploads/".length);
  }

  if (path.isAbsolute(fileUrl)) {
    return path.basename(fileUrl);
  }

  try {
    const url = new URL(fileUrl);
    const bucket =
      process.env.MINIO_BUCKET || process.env.S3_BUCKET || "silah-legal";
    let keyPath = url.pathname.substring(1); // strip leading /
    // MinIO path-style includes bucket: /bucket/key
    if (keyPath.startsWith(`${bucket}/`)) {
      keyPath = keyPath.substring(bucket.length + 1);
    }
    return keyPath;
  } catch {
    return fileUrl;
  }
}

export type { IStorageService };
