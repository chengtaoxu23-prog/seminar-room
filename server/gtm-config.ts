import type { GtmConfig, ModelStage } from '../src/shared/gtm.js';
import { MODEL_STAGES } from '../src/shared/gtm.js';
import { SchemaError } from './validation.js';
const defaults: GtmConfig = {
  protocolVersion: 'gtm-p1a-v1',
  structure: { maxRisks: 8, maxClaimsPerRisk: 4, maxCitationsPerClaim: 3 },
  capacity: { maxSources: 20, maxSourceChars: 300_000, maxTotalChars: 300_000, materialEstimatedTokens: 24_576, requestEstimatedInputTokens: 49_152 },
  requests: { maxCalls: 10, maxPerStage: 2, outputTokens: { blue_proposal: 2048, red_challenge: 16384, red_verifier: 8192, blue_rebuttal: 12288, rebuttal_verifier: 8192 } },
  estimator: { version: 'gtm-conservative-v2', cjkTokensPerCodePoint: 1.75, otherTokensPerCodePoint: 0.35, riskTokensPerCodePoint: 1, safetyFactor: 1.25, requestOverheadTokens: 256 },
  text: { id: 200, short: 500, long: 2000, quoteUtf16: 220, businessBrief: 15000, note: 5000, listItems: 20 },
};
function exactKeys(value: object, template: object, name: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== Object.keys(template).sort().join('|')) throw new SchemaError(`${name}: 配置字段不匹配。`);
}
function positive(value: number, name: string, max = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new SchemaError(`${name}: 配置必须为范围内正整数。`);
}
export function validateGtmConfig(config: GtmConfig): void {
  exactKeys(config, defaults, 'config');
  for (const key of ['structure','capacity','requests','text'] as const) exactKeys(config[key], defaults[key], key);
  if (config.protocolVersion !== defaults.protocolVersion || config.structure.maxRisks !== 8 || config.structure.maxClaimsPerRisk !== 4 || config.structure.maxCitationsPerClaim !== 3 || config.requests.maxPerStage !== 2 || config.text.quoteUtf16 !== 220) throw new SchemaError('不能突破已批准的结构、修复次数和旧引文约束。');
  for (const [key, value] of Object.entries(config.capacity)) positive(value, key);
  if (config.capacity.maxSources > 20 || config.capacity.maxTotalChars > 300000 || config.capacity.maxSourceChars > config.capacity.maxTotalChars) throw new SchemaError('材料配置超过已批准容量。');
  positive(config.requests.maxCalls, 'maxCalls', 10);
  exactKeys(config.requests.outputTokens, defaults.requests.outputTokens, 'outputTokens');
  for (const stage of MODEL_STAGES) positive(config.requests.outputTokens[stage], stage);
  for (const [key,value] of Object.entries(config.text)) positive(value, key);
  const estimatorTemplate={...defaults.estimator};
  if(config.estimator.version==='gtm-conservative-v1')delete estimatorTemplate.riskTokensPerCodePoint;
  exactKeys(config.estimator,estimatorTemplate,'estimator');
  if (!['gtm-conservative-v1','gtm-conservative-v2'].includes(config.estimator.version)) throw new SchemaError('未知估算器版本。');
  for (const key of ['cjkTokensPerCodePoint','otherTokensPerCodePoint','safetyFactor'] as const) {
    if (!Number.isFinite(config.estimator[key]) || config.estimator[key] <= 0 || (key==='safetyFactor' && config.estimator[key]<1)) throw new SchemaError(`${key}: 保守估算系数不能小于1。`);
  }
  if(config.estimator.version==='gtm-conservative-v2'&&(!Number.isFinite(config.estimator.riskTokensPerCodePoint)||config.estimator.riskTokensPerCodePoint!<1))throw new SchemaError('高风险文本系数必须至少为1。');
  if (config.estimator.cjkTokensPerCodePoint < config.estimator.otherTokensPerCodePoint) throw new SchemaError('中文估算系数不能低于其他字符。');
  if (!Number.isSafeInteger(config.estimator.requestOverheadTokens) || config.estimator.requestOverheadTokens < 0) throw new SchemaError('无效请求余量。');
}
export function createGtmConfig(overrides: {
  capacity?: Partial<GtmConfig['capacity']>;
  requests?: { maxCalls?: number; outputTokens?: Partial<Record<ModelStage, number>> };
  estimator?: Partial<GtmConfig['estimator']>; text?: Partial<GtmConfig['text']>;
} = {}): GtmConfig {
  for (const key of Object.keys(overrides)) if (!['capacity','requests','estimator','text'].includes(key)) throw new SchemaError(`未知配置 ${key}`);
  const value: GtmConfig = {
    ...structuredClone(defaults),
    capacity: { ...defaults.capacity, ...overrides.capacity },
    requests: { ...defaults.requests, ...overrides.requests, outputTokens: { ...defaults.requests.outputTokens, ...overrides.requests?.outputTokens } },
    estimator: { ...defaults.estimator, ...overrides.estimator }, text: { ...defaults.text, ...overrides.text },
  };
  validateGtmConfig(value);
  return value;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
export const DEFAULT_GTM_CONFIG: GtmConfig = deepFreeze(createGtmConfig());
