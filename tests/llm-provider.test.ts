import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from '../server/config.js';
import { chatCompletion } from '../server/llm.js';

test('Qwen adapter sends non-thinking tools request and parses tool response without network', async () => {
  const saved = { ...config };
  const fetchOriginal = globalThis.fetch;
  try {
    Object.assign(config, { configured: true, apiKey: 'test-only', model: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' });
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.enable_thinking, false);
      assert.equal(body.stream, false);
      assert.equal(body.tool_choice, 'required');
      assert.equal(body.tools[0].function.name, 'read_material');
      return new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: 'test', type: 'function', function: { name: 'read_material', arguments: '{"id":1}' } }] }, finish_reason: 'tool_calls' }] }), { status: 200 });
    };
    const result = await chatCompletion([{ role: 'user', content: 'test' }], { toolChoice: 'required', tools: [{ type: 'function', function: { name: 'read_material', description: 'test', parameters: { type: 'object' } } }] });
    assert.equal(result.toolCalls[0].function.name, 'read_material');
    assert.equal(result.content, '');
  } finally {
    Object.assign(config, saved);
    globalThis.fetch = fetchOriginal;
  }
});
