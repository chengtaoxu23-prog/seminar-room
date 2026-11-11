/** Protocol only. No execution loop or model calls. */
import type { AuditPosition, AuditState, AuditLifecycle, ModelStage } from '../src/shared/gtm.js';
import { SchemaError } from './validation.js';
const edges: Record<string, string[]> = {
  'blue_proposal:generating': ['blue_proposal:repairing','blue_proposal:validated'],
  'blue_proposal:repairing': ['blue_proposal:validated'],
  'blue_proposal:validated': ['red_challenge:generating'],
  'red_challenge:generating': ['red_challenge:repairing','red_challenge:validated'],
  'red_challenge:repairing': ['red_challenge:validated'],
  'red_challenge:validated': ['verifier:citation_check'],
  'verifier:citation_check': ['verifier:red_repair_pending','verifier:reviewing','verifier:verified'],
  'verifier:red_repair_pending': ['verifier:citation_check'],
  'verifier:reviewing': ['verifier:repairing','verifier:verified'],
  'verifier:repairing': ['verifier:verified'],
  'verifier:verified': ['blue_rebuttal:generating'],
  'blue_rebuttal:generating': ['blue_rebuttal:blue_repairing','blue_rebuttal:citation_check'],
  'blue_rebuttal:blue_repairing': ['blue_rebuttal:citation_check'],
  'blue_rebuttal:citation_check': ['blue_rebuttal:blue_repairing','blue_rebuttal:rebuttal_verifying','blue_rebuttal:verified'],
  'blue_rebuttal:rebuttal_verifying': ['blue_rebuttal:verifier_repairing','blue_rebuttal:verified'],
  'blue_rebuttal:verifier_repairing': ['blue_rebuttal:verified'],
  'blue_rebuttal:verified': ['convergence:assembling'],
  'convergence:assembling': ['convergence:assembled'], 'convergence:assembled': [],
};
const key = (state: AuditPosition): string => `${state.phase}:${state.substate}`;
export function validateAuditState(state: AuditState): void {
  if (!state || Object.keys(state).sort().join('|') !== 'lifecycle|phase|substate' || !Object.hasOwn(edges,key(state)) || !['draft','running','paused','failed','cancelled','completed'].includes(state.lifecycle)) throw new SchemaError('无效生命周期/phase/substate组合。');
  if (state.lifecycle === 'draft' && key(state) !== 'blue_proposal:generating') throw new SchemaError('草稿只能位于初始游标。');
  if (state.lifecycle === 'completed' && key(state) !== 'convergence:assembled') throw new SchemaError('完成状态必须经过确定性收敛。');
}
export const initialAuditState = (): AuditState => ({ lifecycle: 'draft', phase: 'blue_proposal', substate: 'generating' });
export type AuditEvent = { type: 'start' | 'pause' | 'resume' | 'fail' | 'cancel' | 'complete' } | { type: 'advance'; to: AuditPosition };
export function transitionAuditState(state: AuditState, event: AuditEvent): AuditState {
  validateAuditState(state);
  let result = structuredClone(state);
  const change = (lifecycle: AuditLifecycle) => { result.lifecycle = lifecycle; };
  const reject = (): never => { throw new SchemaError(`禁止状态转换 ${state.lifecycle}/${key(state)} → ${event.type}`); };
  if (event.type === 'start') { if (state.lifecycle !== 'draft') reject(); change('running'); }
  else if (event.type === 'pause') { if (state.lifecycle !== 'running') reject(); change('paused'); }
  else if (event.type === 'resume') { if (!['paused','failed'].includes(state.lifecycle)) reject(); change('running'); }
  else if (event.type === 'fail') { if (!['running','paused'].includes(state.lifecycle)) reject(); change('failed'); }
  else if (event.type === 'cancel') { if (['completed','cancelled'].includes(state.lifecycle)) reject(); change('cancelled'); }
  else if (event.type === 'complete') { if (state.lifecycle !== 'running' || key(state) !== 'convergence:assembled') reject(); change('completed'); }
  else if (event.type === 'advance') {
    if (state.lifecycle !== 'running' || !edges[key(state)].includes(key(event.to))) reject();
    result = { ...event.to, lifecycle: 'running' };
  }
  else reject();
  validateAuditState(result);
  return result;
}
export function assertAuditStateChange(previous: AuditState, next: AuditState): void {
  validateAuditState(previous); validateAuditState(next);
  if (JSON.stringify(previous) === JSON.stringify(next)) return;
  const events: AuditEvent[] = ['start','pause','resume','fail','cancel','complete'].map(type => ({ type } as AuditEvent));
  events.push({ type: 'advance', to: { phase: next.phase, substate: next.substate } as AuditPosition });
  for (const event of events) {
    try { const result=transitionAuditState(previous,event); if (result.lifecycle===next.lifecycle && key(result)===key(next)) return; } catch { /* test next legal event */ }
  }
  throw new SchemaError('禁止跳阶段或改写终态。');
}
/** Caller must persist this state before accepting any explicit resume command. */
export function interruptedAuditState(state: AuditState): AuditState {
  validateAuditState(state);
  return state.lifecycle === 'running' ? { ...state, lifecycle: 'paused' } : structuredClone(state);
}
export function requestStageForState(state: AuditState): ModelStage | null {
  if (state.lifecycle !== 'running') return null;
  const k=key(state);
  if (['blue_proposal:generating','blue_proposal:repairing'].includes(k)) return 'blue_proposal';
  if (['red_challenge:generating','red_challenge:repairing','verifier:red_repair_pending'].includes(k)) return 'red_challenge';
  if (['verifier:reviewing','verifier:repairing'].includes(k)) return 'red_verifier';
  if (['blue_rebuttal:generating','blue_rebuttal:blue_repairing'].includes(k)) return 'blue_rebuttal';
  if (['blue_rebuttal:rebuttal_verifying','blue_rebuttal:verifier_repairing'].includes(k)) return 'rebuttal_verifier';
  return null;
}
