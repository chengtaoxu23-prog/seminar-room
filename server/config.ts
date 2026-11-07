import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

function integer(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function numberInRange(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(process.env[name] ?? '');
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(invalid base URL)';
  }
}

export interface AppConfig {
  port: number;
  host: '127.0.0.1';
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  dataDir: string;
  publicDir: string;
  limits: {
    maxRounds: number;
    maxCalls: number;
    maxOutputTokens: number;
    timeoutMs: number;
  };
  configured: boolean;
  baseUrlHost: string;
}

const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').trim();
const apiKey = (process.env.OPENAI_API_KEY ?? '').trim();

export const config: AppConfig = {
  port: integer('SEMINAR_PORT', 4317, 1024, 65535),
  host: '127.0.0.1',
  apiKey,
  baseUrl,
  model: (process.env.OPENAI_MODEL ?? 'gpt-4o-mini').trim(),
  temperature: numberInRange('SEMINAR_TEMPERATURE', 0.55, 0, 1.5),
  dataDir: path.resolve(
    process.env.SEMINAR_DATA_DIR ?? path.join(process.cwd(), 'data', 'sessions'),
  ),
  publicDir: path.resolve(process.cwd(), 'dist', 'web'),
  limits: {
    maxRounds: integer('SEMINAR_MAX_ROUNDS', 6, 1, 6),
    maxCalls: integer('SEMINAR_MAX_CALLS', 30, 8, 60),
    maxOutputTokens: integer('SEMINAR_MAX_OUTPUT_TOKENS', 700, 200, 1600),
    timeoutMs: integer('SEMINAR_REQUEST_TIMEOUT_MS', 60_000, 10_000, 180_000),
  },
  configured: Boolean(apiKey && baseUrl),
  baseUrlHost: hostOf(baseUrl),
};

export function maskedEndpoint(): string {
  return `${config.baseUrlHost} · ${config.model}`;
}
