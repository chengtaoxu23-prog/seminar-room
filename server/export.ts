import type { SeminarMessage, SeminarSession } from '../src/shared/types.js';

function iso(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function plainMessage(message: SeminarMessage): string {
  if (message.blocks.length === 0) return message.text;
  return message.blocks
    .map((block) => {
      const citations = block.citations
        .map((citation) => `[材料 ${citation.paragraphId}：“${citation.quote}”]`)
        .join(' ');
      return `- ${block.type === 'background' ? '模型背景（非材料）' : block.type}：${block.text}${citations ? ` ${citations}` : ''}`;
    })
    .join('\n');
}

function stopReasonLabel(reason: string | null): string {
  const labels: Record<string, string> = {
    host_end: '主持人结束',
    round_limit: '达到轮次上限',
    user_end: '用户结束',
    call_limit: '达到调用上限',
    api_error: '模型调用失败',
  };
  return reason ? (labels[reason] ?? reason) : '—';
}

export function toMarkdown(session: SeminarSession): string {
  const lines: string[] = [];
  lines.push(`# SeminarRoom 研讨记录：${session.config.topic}`);
  lines.push('');
  lines.push(`- 会话 ID：\`${session.id}\``);
  lines.push(`- 创建时间：${iso(session.createdAt)}`);
  lines.push(`- 状态：${session.stage}（停止原因：${stopReasonLabel(session.stopReason)}）`);
  lines.push(`- 模型：${session.provider.model}（${session.provider.baseUrlHost}）`);
  lines.push(`- 轮次：${session.round} / ${session.limits.maxRounds}`);
  lines.push(`- 模型调用：${session.usage.calls} / ${session.limits.maxCalls}`);
  lines.push(
    `- Token 用量：输入 ${session.usage.promptTokens}，输出 ${session.usage.completionTokens}，合计 ${session.usage.totalTokens}${session.usage.usageMissingCalls > 0 ? `（${session.usage.usageMissingCalls} 次调用未返回 usage）` : ''}`,
  );
  lines.push('');
  lines.push('> 本文件是从实际会话状态导出的记录；引用可回到材料编号核对。示例回放不作为模型能力或事实证据。');
  lines.push('');
  lines.push('## 讨论问题');
  session.questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.text}`);
  });
  lines.push('');
  lines.push('## 材料');
  session.material.segments.forEach((segment) => {
    lines.push(`### 材料 ${segment.id}`);
    lines.push('');
    lines.push(segment.text);
    lines.push('');
  });
  lines.push('## 讨论记录');
  lines.push('');
  if (session.messages.length === 0) lines.push('_没有发言。_');
  for (const message of session.messages) {
    const speaker =
      message.actorId === 'user'
        ? '用户'
        : `${message.actorName}${message.role === 'host' ? '（主持人）' : '（参与者）'}`;
    lines.push(`### 第 ${message.round} 轮 · ${speaker}`);
    lines.push('');
    lines.push(plainMessage(message));
    if (message.participant?.directToUser) {
      lines.push('');
      lines.push('_此发言直接回应用户插话。_');
    }
    lines.push('');
  }
  lines.push('## 讨论总结');
  lines.push('');
  if (session.summary.status !== 'ready') {
    lines.push(
      `_总结状态：${session.summary.status}${session.summary.error ? `；${session.summary.error}` : ''}_`,
    );
  } else {
    lines.push('### 共识');
    lines.push('');
    lines.push(session.summary.consensus.length ? session.summary.consensus.map((item) => `- ${item}`).join('\n') : '- （未形成明确共识）');
    lines.push('');
    lines.push('### 分歧');
    lines.push('');
    lines.push(session.summary.disagreements.length ? session.summary.disagreements.map((item) => `- ${item}`).join('\n') : '- （未记录到明确分歧）');
    lines.push('');
    lines.push('### 材料依据');
    lines.push('');
    if (session.summary.evidence.length === 0) {
      lines.push('- （没有通过逐字核对的材料依据）');
    } else {
      for (const item of session.summary.evidence) {
        lines.push(`- 材料 ${item.paragraphId}：“${item.quote}”${item.note ? ` — ${item.note}` : ''}`);
      }
    }
    lines.push('');
    lines.push('### 未解决问题');
    lines.push('');
    lines.push(session.summary.unresolved.length ? session.summary.unresolved.map((item) => `- ${item}`).join('\n') : '- （无）');
  }
  lines.push('');
  lines.push('## 技术记录（真实调用）');
  lines.push('');
  lines.push(
    `独立上下文：主持人、参与者 A、参与者 B 每次调用均使用各自组装的上下文，不共享聊天状态。调用数 ${session.calls.length}，采样上下文指纹见下表。`,
  );
  lines.push('');
  lines.push('| 时间 | 角色 | 目的 | 轮次 | 状态 | 耗时 | 输入/输出 token | 上下文指纹 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const call of session.calls) {
    const tokens =
      call.usage.totalTokens === null
        ? '未返回'
        : `${call.usage.promptTokens ?? '?'} / ${call.usage.completionTokens ?? '?'}`;
    lines.push(
      `| ${iso(call.startedAt)} | ${call.actorName} | ${call.purpose} | ${call.round} | ${call.status}${call.httpStatus ? ` ${call.httpStatus}` : ''} | ${call.durationMs}ms | ${tokens} | \`${call.contextHash}\` |`,
    );
  }
  for (const call of session.calls) {
    if (call.toolCalls.length) {
      lines.push('');
      lines.push(
        `- ${call.actorName} 的工具调用：${call.toolCalls.map((tool) => `${tool.name}(${JSON.stringify(tool.args)}) → ${tool.resultChars} 字`).join('；')}`,
      );
    }
  }
  lines.push('');
  lines.push(`_导出时间：${iso(new Date().toISOString())}；导出内容来自服务端实际会话状态。_`);
  lines.push('');
  return lines.join('\n');
}

export interface JsonExport {
  exportedAt: string;
  note: string;
  session: SeminarSession;
}

export function toJson(session: SeminarSession): JsonExport {
  return {
    exportedAt: new Date().toISOString(),
    note: 'SeminarRoom 实际会话状态导出。不包含 API 密钥、原始提示词或模型响应体。示例回放不是模型运行证据。',
    session,
  };
}
