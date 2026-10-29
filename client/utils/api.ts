import { createFormDataFile } from '@/utils';

export const API = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL || '').replace(/\/$/, '');

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `请求失败(${res.status})`);
  }
  return res.json();
}

export async function apiPost<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `请求失败(${res.status})`);
  }
  return res.json();
}

export async function apiPut<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `请求失败(${res.status})`);
  }
  return res.json();
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: 'DELETE' });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `请求失败(${res.status})`);
  }
  return res.json();
}

export async function uploadProof(fileUri: string, mimeType: string, fileName: string) {
  /**
   * 服务端文件：server/src/routes/upload.ts
   * 接口：POST /api/v1/upload/proof (multipart/form-data)
   * 参数：file: 图片/视频文件
   */
  const file = await createFormDataFile(fileUri, fileName, mimeType);
  const formData = new FormData();
  formData.append('file', file as any);
  const res = await fetch(`${API}/api/v1/upload/proof`, { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '上传失败');
  return data;
}