import type { LlmMessage } from '../../server/llm.js';
import { mockReply, response } from './baseline-mock.js';

export function pendingIds(messages: LlmMessage[]) {
  const user = messages.find(m => m.role === 'user')?.content ?? '';
  const section = user.split('[你必须先直接回应的用户消息]')[1]?.split('[需要直接回应的近期发言]')[0] ?? '';
  return [...section.matchAll(/id=([0-9a-f-]{36})/g)].map(m => m[1]);
}

export function acknowledgingReply(messages: LlmMessage[]) {
  const reply = JSON.parse(mockReply(messages).content);
  if (reply.action) {
    if (messages.some(m => m.content.includes('待回应角色=b；'))) reply.participantId = 'b';
  } else if (reply.blocks) reply.addresses = pendingIds(messages);
  return response(reply);
}
