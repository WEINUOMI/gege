import { S3Storage } from "coze-coding-dev-sdk";

export const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

export async function uploadFromBuffer(buffer: Buffer, fileName: string, contentType: string): Promise<string> {
  const key = await storage.uploadFile({
    fileContent: buffer,
    fileName,
    contentType,
  });
  return key;
}

export async function fileUrl(key: string): Promise<string> {
  if (!key) return "";
  return storage.generatePresignedUrl({ key, expireTime: 2592000 });
}

export async function publicFileUrls(keys: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const k of keys) {
    if (k) map[k] = await fileUrl(k);
  }
  return map;
}