import { Platform } from 'react-native';
import { createFormDataFile } from '@/utils';

/**
 * Web 端（预览/线上）页面由平台从页面源站承载，且该源站已反向代理 `/api/v1/*` 到后端，
 * 因此 Web 端应同源请求（相对路径），避免跨域/域名在浏览器预览不可达导致 NetworkError。
 * 原生端（Android/iOS）无同源代理，使用系统注入的绝对后端地址。
 */
const injectedBase = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL || '').replace(/\/$/, '');
export const API = Platform.OS === 'web' ? '' : injectedBase;

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
  let res: Response;
  try {
    res = await fetch(`${API}/api/v1/upload/proof`, { method: 'POST', body: formData });
  } catch {
    // 原生端 fetch 在此场景只会抛出笼统的 "Network request failed"，
    // 补上实际请求地址，便于判断是地址不通还是网关中断
    throw new Error(`上传请求未能完成（目标：${API || '同源'}/api/v1/upload/proof）`);
  }
  const data = await res.json().catch(() => ({}) as any);
  if (!res.ok) throw new Error(data.error || `上传失败(${res.status})`);
  return data;
}

/**
 * 上传凭证（Base64 + JSON 通道）
 * 用途：原生端 multipart 上传失败时的兜底，绕开 multipart 解析链路。
 * 接口：POST /api/v1/upload/proof-base64
 */
export async function uploadProofBase64(base64: string, mimeType = 'image/jpeg', fileName = 'proof.jpg') {
  return apiPost<{ key: string; url: string; type: string; size: number }>('/api/v1/upload/proof-base64', {
    data: base64,
    mime: mimeType,
    name: fileName,
  });
}
