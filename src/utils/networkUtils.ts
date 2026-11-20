/**
 * 网络工具层：URL 规范化、超时、重试、错误分类、连接测试
 */

export type ErrorKind =
  | 'no_api_key'
  | 'no_base_url'
  | 'timeout'
  | 'network'
  | 'dns'
  | 'cors'
  | 'ssl'
  | 'auth'
  | 'rate_limit'
  | 'quota'
  | 'server'
  | 'client'
  | 'parse'
  | 'unknown';

export class ApiError extends Error {
  kind: ErrorKind;
  status?: number;
  retryable: boolean;
  constructor(kind: ErrorKind, message: string, status?: number, retryable = false) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.retryable = retryable;
  }
}

export interface RequestOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT = 1800000; // 30分钟超时
const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY = 1000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 规范化 URL：补全协议、去除尾斜杠
 * 对本地地址（localhost / 192.168.x.x / 10.x.x.x / 127.x.x.x）默认使用 http://
 */
export function normalizeUrl(input: string): string {
  if (!input) return '';
  let url = input.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    // 本地地址默认用 http，外网地址默认用 https
    const isLocal =
      /^localhost[:\/]/i.test(url) ||
      /^127\./.test(url) ||
      /^10\./.test(url) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(url) ||
      /^192\.168\./.test(url);
    url = (isLocal ? 'http://' : 'https://') + url;
  }
  return url.replace(/\/+$/, '');
}

/**
 * 拼接 baseUrl 和 path，确保只有一个 /
 */
export function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  let p = (path || '').trim();
  if (!p.startsWith('/') && p) p = '/' + p;
  return b + p;
}

/**
 * 从错误中识别类型（fetch 抛错 / 状态码 / abort）
 */
export function classifyError(error: any, status?: number): ApiError {
  if (error instanceof ApiError) return error;

  if (error?.name === 'AbortError') {
    return new ApiError('timeout', '请求超时（>30秒）', undefined, true);
  }

  const msg = (error?.message || String(error || '')).toLowerCase();

  if (status === 401 || status === 403) {
    return new ApiError('auth', 'API 密钥无效或无权限', status, false);
  }
  if (status === 429) {
    return new ApiError('rate_limit', '请求过于频繁，请稍后再试', status, true);
  }
  if (status === 402 || status === 403) {
    return new ApiError('quota', 'API 余额不足或额度已用尽', status, false);
  }
  if (status && status >= 500) {
    return new ApiError('server', `服务器错误 (${status})`, status, true);
  }
  if (status && status >= 400) {
    return new ApiError('client', `请求错误 (${status})`, status, false);
  }

  if (msg.includes('network request failed') || msg.includes('failed to fetch')) {
    return new ApiError('network', '无法连接到服务器，请检查网络或地址', undefined, true);
  }
  if (msg.includes('dns') || msg.includes('resolve') || msg.includes('getaddrinfo')) {
    return new ApiError('dns', '域名解析失败，请检查地址是否正确', undefined, true);
  }
  if (msg.includes('ssl') || msg.includes('certificate') || msg.includes('cert')) {
    return new ApiError('ssl', 'SSL 证书错误，可尝试使用 http://', undefined, false);
  }
  if (msg.includes('cors') || msg.includes('cross-origin')) {
    return new ApiError('cors', '跨域被拦截，需服务端支持 CORS 或使用代理', undefined, false);
  }

  return new ApiError('unknown', error?.message || '未知错误', undefined, true);
}

export function getErrorMessage(error: any): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error?.message) {
    if (error.message.includes('Network request failed')) {
      return '无法连接到服务器，请检查网络或 Base URL 是否正确';
    }
    return error.message;
  }
  return '未知错误';
}

/**
 * 通用 fetch 封装：超时 + 重试 + 错误分类
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  options: RequestOptions = {}
): Promise<Response> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    signal: externalSignal,
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;

    if (externalSignal) {
      if (externalSignal.aborted) {
        if (timeoutId) clearTimeout(timeoutId);
        throw new ApiError('timeout', '请求被取消', undefined, false);
      }
      externalSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      if (timeoutId) clearTimeout(timeoutId);

      if (response.ok) return response;

      const err = classifyError(null, response.status);
      if (!err.retryable || attempt >= retries) {
        throw err;
      }
      lastError = err;
      await sleep(retryDelay * (attempt + 1));
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);
      const err = classifyError(error);
      if (!err.retryable || attempt >= retries) {
        throw err;
      }
      lastError = err;
      await sleep(retryDelay * (attempt + 1));
    }
  }

  throw lastError || new ApiError('unknown', '请求失败', undefined, false);
}

/**
 * 从完整 API URL 中提取根地址（去掉 /chat/completions 等后缀）
 */
export function getApiRoot(url: string): string {
  return normalizeUrl(url)
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/images\/generations\/?$/i, '')
    .replace(/\/models\/?$/i, '');
}

/**
 * 测试连接：检查 API 地址是否可达
 */
export async function testConnection(baseUrl: string, apiKey?: string): Promise<{
  ok: boolean;
  latency?: number;
  error?: string;
  errorKind?: ErrorKind;
}> {
  const start = Date.now();
  try {
    const root = getApiRoot(baseUrl);
    if (!root) {
      return { ok: false, error: '请先填写 API 主机' };
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    // 用原生 fetch，不经过 safeFetch 的状态码拦截
    const response = await fetch(`${root}/models`, {
      method: 'GET',
      headers,
    });

    // 200/401/403 都算连接成功（说明服务器可达）
    if (response.ok || response.status === 401 || response.status === 403 || response.status === 404) {
      return {
        ok: true,
        latency: Date.now() - start,
      };
    }

    return {
      ok: false,
      latency: Date.now() - start,
      error: `HTTP ${response.status}`,
    };
  } catch (error: any) {
    return {
      ok: false,
      latency: Date.now() - start,
      error: getErrorMessage(error),
      errorKind: error?.kind,
    };
  }
}

/**
 * 检查网络是否在线
 */
export async function checkOnline(): Promise<boolean> {
  try {
    const response = await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      cache: 'no-store',
    });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}
