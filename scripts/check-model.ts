/** Run locally by the key owner. Never prints model responses, config or errors. */
import { config } from '../server/config.js';
import { chatCompletion, LlmRequestError, type LlmMessage } from '../server/llm.js';

const phase = { value: 'JSON 输出' };
try {
  if (!config.configured) {
    console.error('[check] 未配置。请自行填写本机 .env.local，参见 docs/self-setup.md。');
    process.exitCode = 2;
  } else {
    const first = await chatCompletion([
      { role: 'system', content: 'Return only valid JSON, no markdown.' },
      { role: 'user', content: 'Return exactly {"ok":true}.' },
    ], { maxTokens: 300 });
    if (JSON.parse(first.content).ok !== true) throw new Error('JSON');
    console.log('[check] PASS：连接和 JSON 输出。');
    phase.value = '工具调用';
    const messages: LlmMessage[] = [{ role: 'system', content: 'After the tool result, return only a JSON object with quote equal to the ENTIRE tool text, including its prefix and punctuation. No markdown fences.' }, { role: 'user', content: 'Call read_material with id=1. After receiving the tool result, return only JSON {"quote":"the exact material text"}.' }];
    const tools = [{ type: 'function' as const, function: { name: 'read_material', description: 'Read numbered test material.', parameters: { type: 'object', properties: { id: { type: 'integer', enum: [1] } }, required: ['id'], additionalProperties: false } } }];
    const call = await chatCompletion(messages, { tools, toolChoice: 'required', maxTokens: 400 });
    if (!call.toolCalls.length || call.toolCalls.some(t => t.function.name !== 'read_material' || JSON.parse(t.function.arguments).id !== 1)) throw new Error('tool');
    messages.push({ role: 'assistant', content: call.content, tool_calls: call.toolCalls });
    for (const tool of call.toolCalls) messages.push({ role: 'tool', tool_call_id: tool.id, content: '测试材料：周五开放到二十三点。' });
    phase.value = '工具结果续答';
    const answer = await chatCompletion(messages, { maxTokens: 400 });
    if (answer.finishReason === 'length') throw new Error('OUTPUT_TRUNCATED');
    if (!answer.content.trim()) throw new Error('EMPTY_REPLY');
    let parsed: { quote?: unknown };
    try { parsed = JSON.parse(answer.content); } catch { throw new Error('NOT_JSON'); }
    if (parsed?.quote !== '测试材料：周五开放到二十三点。') throw new Error('QUOTE_MISMATCH');
    console.log('[check] PASS：工具调用、结果续答和原文复述。');
    console.log('[check] 这只是接入检查；完整研讨请自行运行 npm run check:live。');
  }
} catch (error) {
  const codes = ['OUTPUT_TRUNCATED', 'EMPTY_REPLY', 'NOT_JSON', 'QUOTE_MISMATCH'];
  const code = error instanceof LlmRequestError ? error.kind : error instanceof Error && codes.includes(error.message) ? error.message : 'CHECK_FAILED';
  console.error(`[check] 诊断代码：${code}`);
  const status = error instanceof LlmRequestError ? error.status : null;
  const hint = status === 401 || status === 403 ? '检查密钥、地域及模型权限。' : status === 429 ? '检查余额、额度或限流。' : '检查接口地址、模型能力、网络或输出格式。';
  console.error(`[check] FAIL：${phase.value}${status ? `，HTTP ${status}` : ''}。${hint}`);
  console.error('[check] 为保护配置，未打印原始错误和服务商响应。');
  process.exitCode = 1;
}
