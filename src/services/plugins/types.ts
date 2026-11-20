import { AIProvider, ChatMessage, AIType } from '../../types';

export type ApiFormat =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'azure'
  | 'custom'
  | 'python_proxy';

export type StreamChunkEvent =
  | { type: 'content'; content: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'usage'; usage: { promptTokens: number; completionTokens: number; totalTokens: number } };

export interface ChatOptions {
  retries?: number;
  onRetry?: (attempt: number, error: any) => void;
  signal?: AbortSignal;
  timeout?: number;
  onTokenUsage?: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void;
  /** 新增：思考内容回调，兼容 reasoning_content / thinking / delta.reasoning */
  onThinkingChunk?: (thinking: string) => void;
  /** 新增：结构化事件回调（新接口优先使用） */
  onChunkEvent?: (event: StreamChunkEvent) => void;
}

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

export interface PluginCapabilities {
  text: boolean;
  image: boolean;
  vision: boolean;
  summary: boolean;
  streaming: boolean;
  functionCalling: boolean;
}

export interface AIPlugin {
  id: string;
  name: string;
  format: ApiFormat;
  description: string;
  capabilities: Partial<PluginCapabilities>;

  chat(
    provider: AIProvider,
    messages: ChatMessage[],
    systemPrompt: string,
    streamCallback?: (chunk: string) => void,
    options?: ChatOptions
  ): Promise<string>;

  generateImage?(
    provider: AIProvider,
    prompt: string,
    size?: string,
    options?: ChatOptions
  ): Promise<string[]>;

  visionAnalyze?(
    provider: AIProvider,
    imageUrl: string,
    prompt: string,
    options?: ChatOptions
  ): Promise<string>;

  fetchModels?(
    baseUrl: string,
    apiKey: string,
    options?: ChatOptions
  ): Promise<{ models: string[]; error?: string }>;

  detectCapabilities?(models: string[]): AIType[];

  testConnection?(
    baseUrl: string,
    apiKey: string
  ): Promise<{ ok: boolean; latency?: number; error?: string }>;
}

export interface PluginPreset {
  id: string;
  name: string;
  format: ApiFormat;
  baseUrl: string;
  apiPath?: string;
  defaultModel: string;
  capabilities: AIType[];
  description?: string;
  website?: string;
}
