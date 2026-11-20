import { AIProvider, ChatMessage, AIType } from '../../types';
import { safeFetch, ApiError, getErrorMessage, normalizeUrl } from '../../utils/networkUtils';
import { AIPlugin, ChatOptions } from './types';

const getApiBase = (provider: AIProvider): string => {
  const url = normalizeUrl(provider.baseUrl);
  if (!url) return '';
  return url
    .replace(/\/v1beta\/models\/.*$/i, '')
    .replace(/\/v1\/models\/.*$/i, '')
    .replace(/\/v1beta\/?$/i, '')
    .replace(/\/v1\/?$/i, '')
    .replace(/\/models\/?$/i, '');
};

const getApiVersion = (provider: AIProvider): string => {
  const url = normalizeUrl(provider.baseUrl || '');
  if (/\/v1beta\//i.test(url) || /v1beta$/i.test(url)) return 'v1beta';
  const model = (provider.model || '').toLowerCase();
  if (model.includes('2.5') || model.includes('2-5') || model.includes('gemini-3')) return 'v1beta';
  return 'v1';
};

async function parseGeminiStream(
  response: Response,
  onStream: (chunk: string) => void
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr) continue;

        try {
          const data = JSON.parse(dataStr);
          const candidates = data.candidates || (Array.isArray(data) ? data[0]?.candidates : []);
          const candidate = candidates?.[0];
          if (!candidate) continue;
          const parts = candidate.content?.parts || [];
          const text = parts.map((p: any) => p.text || '').join('');
          if (text) {
            const delta = text.startsWith(fullText) ? text.slice(fullText.length) : text;
            if (delta) {
              fullText = text;
              try {
                onStream(delta);
              } catch (e) {
                console.warn('onStream callback error:', e);
              }
            }
          }
        } catch {
          // 忽略不完整 JSON
        }
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return fullText;
    throw new ApiError('parse', '解析流式响应失败：' + (err?.message || '未知错误'));
  }

  return fullText;
}

export const geminiPlugin: AIPlugin = {
  id: 'gemini',
  name: 'Google Gemini',
  format: 'gemini',
  description: 'Google Gemini 官方 API 格式，支持 Gemini 1.5/2.0 系列模型',
  capabilities: {
    text: true,
    image: false,
    vision: true,
    summary: true,
    streaming: true,
  },

  async chat(
    provider: AIProvider,
    messages: ChatMessage[],
    systemPrompt: string,
    streamCallback?: (chunk: string) => void,
    options: ChatOptions = {}
  ): Promise<string> {
    const baseUrl = getApiBase(provider);
    if (!baseUrl) throw new ApiError('no_base_url', '请先配置 Base URL');
    if (!provider.apiKey) throw new ApiError('no_api_key', '请先配置 API 密钥');

    const contents: any[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') continue;
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: any[] = [];
      const imgs = (msg.images || []).filter(Boolean);
      // model(assistant) 角色的消息不能带图，否则请求会被打回；
      // 退回成文字说明保住上下文
      if (imgs.length > 0 && role === 'model') {
        const note = `（发送了 ${imgs.length} 张图片/表情包）`;
        parts.push({ text: msg.content ? `${msg.content}\n${note}` : note });
        contents.push({ role, parts });
        continue;
      }
      if (msg.content) parts.push({ text: msg.content });
      for (const img of imgs) {
        if (img.startsWith('data:image')) {
          const match = img.match(/^data:image\/(\w+);base64,(.+)$/);
          if (match) {
            parts.push({
              inline_data: { mime_type: `image/${match[1]}`, data: match[2] },
            });
          }
        } else {
          parts.push({ file_data: { mime_type: 'image/jpeg', file_uri: img } });
        }
      }
      contents.push({ role, parts });
    }

    const body: any = { contents };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const apiVersion = getApiVersion(provider);
    const endpoint = streamCallback
      ? `${baseUrl}/${apiVersion}/models/${encodeURIComponent(provider.model)}:streamGenerateContent?alt=sse&key=${provider.apiKey}`
      : `${baseUrl}/${apiVersion}/models/${encodeURIComponent(provider.model)}:generateContent?key=${provider.apiKey}`;

    const fetchWithRetry = async (attempt = 0): Promise<Response> => {
      try {
        return await safeFetch(
          endpoint,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'AI-Tavern/2.0 (Plugin: Gemini)',
            },
            body: JSON.stringify(body),
          },
          { retries: 0, timeout: 0, signal: options.signal }
        );
      } catch (err: any) {
        if (err?.retryable && attempt < (options.retries ?? 2)) {
          options.onRetry?.(attempt + 1, err);
          const delay = 1000 * (attempt + 1);
          await new Promise((r) => setTimeout(r, delay));
          return fetchWithRetry(attempt + 1);
        }
        throw err;
      }
    };

    let response: Response;
    try {
      response = await fetchWithRetry();
    } catch (err: any) {
      throw new ApiError(err?.kind || 'unknown', getErrorMessage(err), err?.status, false);
    }

    if (streamCallback && response.body) {
      return parseGeminiStream(response, streamCallback);
    }

    try {
      const data = await response.json();
      const candidates = data.candidates || (Array.isArray(data) ? data[0]?.candidates : []);
      const candidate = candidates?.[0];
      const text = candidate?.content?.parts?.map((p: any) => p.text || '').join('') || '';
      return text;
    } catch (err: any) {
      throw new ApiError('parse', '解析响应失败：' + (err?.message || 'JSON 错误'));
    }
  },

  async visionAnalyze(
    provider: AIProvider,
    imageUrl: string,
    prompt: string,
    options: ChatOptions = {}
  ): Promise<string> {
    const fakeMessage: ChatMessage = {
      id: 'vision',
      role: 'user',
      content: prompt,
      images: [imageUrl],
      timestamp: Date.now(),
    };
    return this.chat(provider, [fakeMessage], '', undefined, options);
  },

  async fetchModels(
    baseUrl: string,
    apiKey: string
  ): Promise<{ models: string[]; error?: string }> {
    const knownModels = [
      'gemini-2.5-pro-preview-05-15',
      'gemini-2.0-flash-exp',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-pro',
      'gemini-1.5-pro-latest',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.0-pro',
    ];

    try {
      const normalized = getApiBase({ baseUrl } as AIProvider);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(
        `${normalized}/v1/models?key=${apiKey}`,
        { method: 'GET', signal: controller.signal }
      );
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.models && Array.isArray(data.models)) {
          const models = data.models
            .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m: any) => m.name?.replace(/^models\//, '') || m.name)
            .filter(Boolean);
          if (models.length > 0) return { models };
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        return { models: knownModels, error: '获取模型列表超时，使用预设模型' };
      }
    }

    return { models: knownModels };
  },

  detectCapabilities(models: string[]): AIType[] {
    const caps: AIType[] = ['text', 'summary'];
    const all = models.join(' ').toLowerCase();
    if (all.includes('vision') || all.includes('flash') || all.includes('pro') || all.includes('gemini')) {
      caps.push('vision');
    }
    return caps;
  },

  async testConnection(
    baseUrl: string,
    apiKey: string
  ): Promise<{ ok: boolean; latency?: number; error?: string }> {
    const start = Date.now();
    try {
      const root = getApiBase({ baseUrl } as AIProvider);
      if (!root) return { ok: false, error: '请先填写 API 主机' };
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${root}/v1/models?key=${apiKey}`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok || response.status === 401 || response.status === 403) {
        return { ok: true, latency: Date.now() - start };
      }
      if (response.status === 404) {
        return { ok: false, latency: Date.now() - start, error: 'API 路径不正确，请检查 Base URL' };
      }
      return { ok: false, latency: Date.now() - start, error: `HTTP ${response.status}` };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return { ok: false, latency: Date.now() - start, error: '连接超时，请检查网络或地址' };
      }
      const msg = getErrorMessage(error);
      if (msg.includes('无法连接') || msg.includes('Network request failed')) {
        return { ok: false, latency: Date.now() - start, error: '无法连接到 Google API（国内网络可能需要代理）' };
      }
      return { ok: false, latency: Date.now() - start, error: msg };
    }
  },
};
