import type {
  ApiErrorBody,
  ExampleMaterial,
  HealthResponse,
  ReplayScript,
  SeminarSession,
  SummaryContent,
} from '../src/shared/types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError('无法连接本地服务。请确认 npm run dev 仍在运行。', 0, 'network_error');
  }
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const body = payload as ApiErrorBody | null;
    throw new ApiError(
      body?.error?.message ?? `请求失败（HTTP ${response.status}）。`,
      response.status,
      body?.error?.code ?? 'request_failed',
    );
  }
  return payload as T;
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  examples: () =>
    request<{ materials: ExampleMaterial[]; replays: Array<Pick<ReplayScript, 'id' | 'title' | 'description' | 'notice'>> }>(
      '/api/examples',
    ),
  replay: (id: string) => request<{ replay: ReplayScript }>(`/api/replay/${encodeURIComponent(id)}`),
  session: (id: string) => request<{ session: SeminarSession }>(`/api/sessions/${id}`),
  createSession: (body: {
    material: string;
    topic: string;
    style?: string;
    roles?: Record<string, { name: string }>;
  }) =>
    request<{ session: SeminarSession }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  plan: (id: string) =>
    request<{ session: SeminarSession }>(`/api/sessions/${id}/plan`, { method: 'POST' }),
  updateQuestions: (id: string, questions: string[]) =>
    request<{ session: SeminarSession }>(`/api/sessions/${id}/questions`, {
      method: 'PATCH',
      body: JSON.stringify({ questions }),
    }),
  start: (id: string) =>
    request<{ session: SeminarSession }>(`/api/sessions/${id}/start`, { method: 'POST' }),
  pause: (id: string) =>
    request<{ session: SeminarSession }>(`/api/sessions/${id}/pause`, { method: 'POST' }),
  resume: (id: string) =>
    request<{ session: SeminarSession }>(`/api/sessions/${id}/resume`, { method: 'POST' }),
  end: (id: string) =>
    request<{ session: SeminarSession }>(`/api/sessions/${id}/end`, { method: 'POST' }),
  sendMessage: (id: string, text: string) =>
    request<{ session: SeminarSession }>(`/api/sessions/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  retry: (id: string) =>
    request<{ session: SeminarSession }>(`/api/sessions/${id}/retry`, { method: 'POST' }),
  regenerateSummary: (id: string) =>
    request<{ session: SeminarSession }>(`/api/sessions/${id}/summary`, { method: 'POST' }),
  saveSummary: (id: string, summary: SummaryContent) =>
    request<{ session: SeminarSession }>(`/api/sessions/${id}/summary`, {
      method: 'PATCH',
      body: JSON.stringify(summary),
    }),
};

export function exportUrl(id: string, format: 'md' | 'json'): string {
  return `/api/sessions/${id}/export.${format}`;
}
