import { config } from './config.js';
import { providerOptions } from './provider.js';
import type { TokenUsage } from '../src/shared/types.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}

export interface LlmToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmResponse {
  content: string;
  toolCalls: LlmToolCall[];
  finishReason: string;
  usage: TokenUsage;
  httpStatus: number;
}

export class LlmRequestError extends Error {
  readonly kind: 'not_configured' | 'http' | 'network' | 'timeout' | 'aborted' | 'invalid_response';
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    kind: LlmRequestError['kind'],
    message: string,
    options: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'LlmRequestError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? (kind !== 'aborted' && kind !== 'not_configured');
  }
}

function endpointUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions')
    ? trimmed
    : `${trimmed}/chat/completions`;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return asString((part as { text?: unknown }).text);
        }
        return '';
      })
      .join('');
  }
  return '';
}

function normalizeUsage(value: unknown): TokenUsage {
  const usage = (value ?? {}) as Record<string, unknown>;
  const pick = (key: string): number | null => {
    const candidate = usage[key];
    return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
  };
  return {
    promptTokens: pick('prompt_tokens'),
    completionTokens: pick('completion_tokens'),
    totalTokens: pick('total_tokens'),
  };
}

function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 700);
}

/**
 * One HTTP request to an OpenAI-compatible /chat/completions endpoint.
 * The caller owns budgets, logging, tool loops and retries.
 */
export async function chatCompletion(
  messages: LlmMessage[],
  options: {
    tools?: LlmToolDefinition[];
    toolChoice?: 'auto' | 'required';
    maxTokens?: number;
    signal?: AbortSignal;
    timeoutMs?: number;
    temperature?: number;
  } = {},
): Promise<LlmResponse> {
  if (!config.configured) {
    throw new LlmRequestError('not_configured', '服务端未配置 OPENAI_API_KEY，无法调用模型。');
  }

  const timeoutMs = options.timeoutMs ?? config.limits.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const onAbort = () => controller.abort(new Error('aborted'));
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timer);
      throw new LlmRequestError('aborted', '调用已取消。');
    }
    options.signal.addEventListener('abort', onAbort, { once: true });
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options.temperature ?? config.temperature,
    max_tokens: options.maxTokens ?? config.limits.maxOutputTokens,
    stream: false,
    ...providerOptions(config.baseUrl, config.model),
  };
  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? 'auto';
  }

  try {
    const response = await fetch(endpointUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = '';
      try {
        const text = await response.text();
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string } };
          detail = parsed.error?.message ?? text;
        } catch {
          detail = text;
        }
      } catch {
        detail = '(无法读取错误响应)';
      }
      throw new LlmRequestError(
        'http',
        `模型接口返回 HTTP ${response.status}${detail ? `：${redact(detail)}` : ''}`,
        {
          status: response.status,
          retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
        },
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: { content?: unknown; tool_calls?: LlmToolCall[] };
        finish_reason?: string;
      }>;
      usage?: unknown;
    };
    const choice = payload.choices?.[0];
    if (!choice?.message) {
      throw new LlmRequestError('invalid_response', '模型接口响应中没有 choices[0].message。');
    }
    return {
      content: contentText(choice.message.content),
      toolCalls: Array.isArray(choice.message.tool_calls) ? choice.message.tool_calls : [],
      finishReason: asString(choice.finish_reason) || 'unknown',
      usage: normalizeUsage(payload.usage),
      httpStatus: response.status,
    };
  } catch (error) {
    if (error instanceof LlmRequestError) throw error;
    if (options.signal?.aborted) {
      throw new LlmRequestError('aborted', '调用已取消。');
    }
    if (controller.signal.aborted) {
      throw new LlmRequestError('timeout', `模型调用超过 ${Math.round(timeoutMs / 1000)} 秒。`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new LlmRequestError('network', `无法连接模型接口：${redact(message)}`);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
