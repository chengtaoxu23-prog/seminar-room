import assert from 'node:assert/strict';
import test from 'node:test';
import { providerOptions } from '../server/provider.js';

test('Qwen official endpoints disable thinking for structured responses', () => {
  for (const host of ['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'workspace.cn-beijing.maas.aliyuncs.com']) {
    assert.deepEqual(providerOptions(`https://${host}/compatible-mode/v1`, 'qwen-plus'), { enable_thinking: false });
  }
});

test('other providers and models receive no Qwen-specific parameters', () => {
  for (const [url, model] of [['https://api.openai.com/v1', 'qwen-plus'], ['https://dashscope.aliyuncs.com.evil.example/v1', 'qwen-plus'], ['https://dashscope.aliyuncs.com/v1', 'other-model'], ['invalid', 'qwen-plus']]) {
    assert.deepEqual(providerOptions(url, model), {});
  }
});
