import { createHash } from 'node:crypto';
import type { CitationCandidate, CitationCheck, SourceInput, SourceSnapshot, GtmConfig } from '../src/shared/gtm.js';
import { DEFAULT_GTM_CONFIG, validateGtmConfig } from './gtm-config.js';
import { SchemaError, validateCitation } from './validation.js';
import { parseSourceInput } from './gtm-schema.js';
export const PARAGRAPH_VERSION = 'paragraph-v1' as const;
export const NORMALIZATION_VERSION = 'citation-norm-v1' as const;
export const unicodeLength=(text:string):number=>Array.from(text).length;
export function sourceRevision(raw:string):string{return `sha256:${createHash('sha256').update(raw,'utf8').digest('hex')}`;}
export function segmentSource(raw:string):SourceSnapshot['paragraphs']{
  return raw.replace(/\r\n?/g,'\n').split(/\n(?:[^\S\n]*\n)+/u).map(p=>p.trim()).filter(Boolean).map((text,i)=>({id:i+1,text,chars:unicodeLength(text)}));
}
export function createSource(input:SourceInput,config:GtmConfig=DEFAULT_GTM_CONFIG):SourceSnapshot{
  validateGtmConfig(config);
  input=parseSourceInput(input,config);
  if(Buffer.from(input.rawContent,'utf8').toString('utf8')!==input.rawContent)throw new SchemaError('材料包含无效Unicode序列，无法形成可靠内容哈希。');
  if(!input.id?.trim()||!input.title?.trim()||!input.accessedAt?.trim())throw new SchemaError('材料ID、标题和获取日期不能为空。');
  if(!['pasted_text','txt','md'].includes(input.sourceType))throw new SchemaError('仅支持粘贴文本、UTF-8 TXT和Markdown。');
  if(input.sourceKind!==undefined&&!['official','financial_report','legal','media','forum','other','unknown'].includes(input.sourceKind))throw new SchemaError('来源类型无效。');
  if(typeof input.rawContent!=='string'||!input.rawContent.trim())throw new SchemaError('材料不能为空。');
  if(unicodeLength(input.rawContent)>config.capacity.maxSourceChars)throw new SchemaError(`单份材料超过${config.capacity.maxSourceChars} Unicode字符，不会截断。`);
  return {...input,revision:sourceRevision(input.rawContent),paragraphSegmentationVersion:PARAGRAPH_VERSION,paragraphs:segmentSource(input.rawContent)};
}
export function validateSourceSet(sources:readonly SourceSnapshot[],config:GtmConfig=DEFAULT_GTM_CONFIG):void{
  validateGtmConfig(config);
  if(sources.length>config.capacity.maxSources)throw new SchemaError(`最多${config.capacity.maxSources}份材料。`);
  if(new Set(sources.map(s=>s.id)).size!==sources.length)throw new SchemaError('一次审计不能选中同一材料的多个版本。');
  let total=0;
  for(const source of sources){
    const {revision,paragraphSegmentationVersion,paragraphs,...input}=source;
    const rebuilt=createSource(input,config);
    if(source.revision!==rebuilt.revision||source.paragraphSegmentationVersion!==PARAGRAPH_VERSION||JSON.stringify(source.paragraphs)!==JSON.stringify(rebuilt.paragraphs))throw new SchemaError('材料快照被修改或分段版本不受支持。');
    total+=unicodeLength(source.rawContent);
  }
  if(total>config.capacity.maxTotalChars)throw new SchemaError(`全部材料超过${config.capacity.maxTotalChars} Unicode字符，不会截断。`);
}
export function appendSourceVersion(archive:readonly SourceSnapshot[],source:SourceSnapshot,config=DEFAULT_GTM_CONFIG):SourceSnapshot[]{
  validateSourceSet([source],config);
  const existing=archive.find(s=>s.id===source.id&&s.revision===source.revision);
  if(existing&&JSON.stringify(existing)!==JSON.stringify(source))throw new SchemaError('已有版本不可覆盖。');
  return structuredClone(existing?[...archive]:[...archive,source]);
}
export function normalizeCitationText(text:string):string{
  return text.normalize('NFC').replace(/\r\n?/g,'\n').replace(/\u3000/g,' ').replace(/[\uFF01-\uFF5E]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0xFEE0)).replace(/\s+/gu,' ').trim();
}
export function validateEvidenceCitation(candidate:CitationCandidate,sources:readonly SourceSnapshot[],config=DEFAULT_GTM_CONFIG):CitationCheck{
  const fail=(reason:string):CitationCheck=>({ok:false,candidate:structuredClone(candidate),reason});
  const source=sources.find(s=>s.id===candidate.sourceId&&s.revision===candidate.materialRevision);
  if(!source)return fail('来源或材料revision不存在。');
  try{validateSourceSet([source],config);}catch{return fail('材料快照完整性或分段版本错误。');}
  // The first match is ALWAYS the unchanged legacy validator against real source paragraphs.
  const exact=validateCitation(candidate,source.paragraphs);
  const clean:CitationCandidate={sourceId:candidate.sourceId,materialRevision:candidate.materialRevision,paragraphId:candidate.paragraphId,quote:candidate.quote};
  if(exact.ok)return {ok:true,citation:{...clean,matchMode:'exact'}};
  const rawQuote=candidate.quote.trim();
  if(!Number.isInteger(candidate.paragraphId)||!source.paragraphs.some(p=>p.id===candidate.paragraphId)||rawQuote.length<3||rawQuote.length>config.text.quoteUtf16||/…|\.{3}/.test(rawQuote))return fail(exact.reason);
  const normalized=validateCitation({paragraphId:candidate.paragraphId,quote:normalizeCitationText(candidate.quote)},source.paragraphs.map(p=>({...p,text:normalizeCitationText(p.text)})));
  return normalized.ok?{ok:true,citation:{...clean,matchMode:'normalized',normalizationVersion:NORMALIZATION_VERSION}}:fail(normalized.reason);
}

/** Derived integrity summary only. It never replaces per-Claim checks/classification. */
export function deriveEvidenceCitations(claims:readonly import('../src/shared/gtm.js').VerifiedClaim[]):import('../src/shared/gtm.js').EvidenceCitation[]{
  const byKey=new Map<string,import('../src/shared/gtm.js').EvidenceCitation>();
  for(const claim of claims)for(const check of claim.citationChecks)if(check.ok){
    const c=check.citation,key=JSON.stringify([c.sourceId,c.materialRevision,c.paragraphId,c.quote]);
    if(!byKey.has(key))byKey.set(key,structuredClone(c));
  }
  return [...byKey.values()];
}