/**
 * 前端诊断日志：把客户端运行时错误上报到后端 /api/v1/diag/log
 * 仅用于排查线上/预览段错误，不影响主流程。
 */
import { Platform } from 'react-native';
import { API } from './api';

export function reportError(type: string, message: string, detail?: string) {
  try {
    if (typeof fetch !== 'function') return;
    const body: Record<string, string> = {
      type,
      message: String(message).slice(0, 500),
      detail: String(detail || '').slice(0, 3000),
      url: typeof window !== 'undefined' ? String(window.location.href) : '',
    };
    fetch(`${API}/api/v1/diag/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  } catch {
    void 0;
  }
}

/** 在 Web 端挂载全局 未捕获错误 / rejection 监听（原生端无需）。 */
export function mountGlobalErrorReporters() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.addEventListener('error', (e: ErrorEvent) => {
      reportError('error', e.message || 'Script error', e.filename + ':' + e.lineno);
    });
    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
      let detail = '';
      const r = e?.reason;
      if (r instanceof Error) detail = r.stack || r.message;
      else if (r !== undefined && r !== null) detail = String(r).slice(0, 1500);
      reportError('rejection', 'Unhandled promise rejection', detail);
    });
    // HMR 路由兜底：把未匹配路由也当作可诊断信息上报一次（非阻断）
    // eslint-disable-next-line no-console
    console.log('[diag] global reporters mounted');
  } catch {
    // ignore
  }
}