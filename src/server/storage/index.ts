import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get as blobGet, put } from "@vercel/blob";
import { env } from "@/server/env";

export type StoredObject = {
  key: string;
  checksum: string;
  size: number;
};

export interface AssetStorage {
  put(data: Uint8Array, extension: string): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array>;
}

class LocalAssetStorage implements AssetStorage {
  async put(data: Uint8Array, extension: string): Promise<StoredObject> {
    const root = path.resolve(env().ASSET_STORAGE_PATH);
    const date = new Date().toISOString().slice(0, 10);
    const key = `${date}/${randomUUID()}.${extension.replace(/^\./, "")}`;
    const destination = path.join(root, key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, data);
    return {
      key,
      checksum: createHash("sha256").update(data).digest("hex"),
      size: data.byteLength
    };
  }

  async get(key: string): Promise<Uint8Array> {
    const root = path.resolve(env().ASSET_STORAGE_PATH);
    const destination = path.resolve(root, key);
    if (!destination.startsWith(`${root}${path.sep}`)) throw new Error("Invalid storage key");
    return readFile(destination);
  }
}

class BlobAssetStorage implements AssetStorage {
  async put(data: Uint8Array, extension: string): Promise<StoredObject> {
    const token = env().BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
    const date = new Date().toISOString().slice(0, 10);
    const key = `${date}/${randomUUID()}.${extension.replace(/^\./, "")}`;
    // "private" matches how this project's Blob store is actually configured —
    // "public" fails outright with "Cannot use public access on a private store."
    await put(key, Buffer.from(data), { access: "private", addRandomSuffix: false, token });
    return {
      key,
      checksum: createHash("sha256").update(data).digest("hex"),
      size: data.byteLength
    };
  }

  async get(key: string): Promise<Uint8Array> {
    const token = env().BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
    // A private blob's URL isn't fetchable without auth, so use @vercel/blob's
    // get() (it attaches the token) rather than head()+fetch(blob.url).
    const result = await blobGet(key, { access: "private", token });
    if (!result) throw new Error(`Blob not found: ${key}`);
    if (result.statusCode !== 200) throw new Error(`Unexpected blob response for ${key}: ${result.statusCode}`);
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
}

export function storage(): AssetStorage {
  const driver = env().ASSET_STORAGE_DRIVER;
  if (driver === "blob") return new BlobAssetStorage();
  if (driver === "s3") {
    throw new Error("S3 storage requires the production adapter; use local or blob storage instead.");
  }
  return new LocalAssetStorage();
}
