import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { head, put } from "@vercel/blob";
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
    await put(key, Buffer.from(data), { access: "public", addRandomSuffix: false, token });
    return {
      key,
      checksum: createHash("sha256").update(data).digest("hex"),
      size: data.byteLength
    };
  }

  async get(key: string): Promise<Uint8Array> {
    const token = env().BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
    const blob = await head(key, { token });
    const response = await fetch(blob.url);
    if (!response.ok) throw new Error(`Could not read blob (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
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
