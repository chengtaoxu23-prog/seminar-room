/** Strict fixed JSON Schema subset. No coercion, stripping or automatic truncation. */
import type { BlueProposal, RedChallenge, SemanticReview, BlueRebuttal, BusinessContext, SourceInput, GtmConfig } from '../src/shared/gtm.js';
import { DEFAULT_GTM_CONFIG, validateGtmConfig } from './gtm-config.js';
import { SchemaError } from './validation.js';
export interface JsonSchema {
  $schema?: string; anyOf?: JsonSchema[]; type?: string | string[]; enum?: readonly (string | number | boolean | null)[];
  properties?: Record<string, JsonSchema>; required?: string[]; additionalProperties?: false;
  items?: JsonSchema; maxItems?: number; minItems?: number; minLength?: number; maxLength?: number;
  minimum?: number; maximum?: number;
}
export const textSchema = (maxLength: number, minLength = 1): JsonSchema => ({ type: 'string', minLength, maxLength });
export const enumSchema = (...values: string[]): JsonSchema => ({ type: 'string', enum: values });
export const arraySchema = (items: JsonSchema, maxItems: number): JsonSchema => ({ type: 'array', items, maxItems });
export const objectSchema = (properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false });
export function createGtmSchemas(config: GtmConfig = DEFAULT_GTM_CONFIG) {
  validateGtmConfig(config);
  const t=config.text, n=config.structure;
  const text=textSchema(t.long), id=textSchema(t.id), strings=arraySchema(text,t.listItems);
  const nullable: JsonSchema={ type:['string','null'],minLength:1,maxLength:t.long };
  const citation=objectSchema({sourceId:id,materialRevision:textSchema(t.id),paragraphId:{type:'integer',minimum:1},quote:textSchema(t.quoteUtf16,3)});
  const claim=objectSchema({id,text,kind:enumSchema('observation','inference'),reasoning:text,citations:arraySchema(citation,n.maxCitationsPerClaim)});
  const claims=arraySchema(claim,n.maxClaimsPerRisk);
  return {
    citation,
    blue:objectSchema({target_market:nullable,target_customer:nullable,value_prop:text,pricing_model:nullable,gtm_channels:strings,key_assumptions:strings,unknowns:strings}),
    red:objectSchema({challenges:arraySchema(objectSchema({id,risk_type:enumSchema('market','competition','compliance','pricing','unit_economics','distribution'),description:text,reasoning:text,assumptions:strings,proposed_validation:strings,severity:enumSchema('critical','high','medium','low'),claims}),n.maxRisks)}),
    verifier:objectSchema({reviews:arraySchema(objectSchema({claimId:id,relation:enumSchema('supported','partially_supported','unsupported','insufficient_evidence'),directlyStated:{type:'boolean'},reasoning:text}),n.maxRisks*n.maxClaimsPerRisk)}),
    rebuttal:objectSchema({rebuttals:arraySchema(objectSchema({challengeId:id,response:enumSchema('accepted','rebutted','revised','unresolved'),reasoning:text,claims}),n.maxRisks)}),
    context:objectSchema({businessBrief:textSchema(t.businessBrief),projectName:textSchema(t.short),clientLabel:textSchema(t.short),targetMarket:text,targetCustomer:text,competitorInfo:textSchema(t.note),background:textSchema(t.note)},['businessBrief']),
    source:objectSchema({id,title:textSchema(t.short),sourceType:enumSchema('pasted_text','txt','md'),sourceKind:enumSchema('official','financial_report','legal','media','forum','other','unknown'),originalUrl:text,publishedAt:textSchema(t.short),accessedAt:textSchema(t.short),jurisdiction:textSchema(t.short),rawContent:textSchema(config.capacity.maxSourceChars)},['id','title','sourceType','accessedAt','rawContent']),
    humanReview:objectSchema({challengeId:id,decision:enumSchema('include','further_research','not_applicable'),note:textSchema(t.note,0),reviewedAt:textSchema(t.short)}),
  };
}
const schemas=createGtmSchemas();
export const CITATION_CANDIDATE_SCHEMA=schemas.citation;
export const BLUE_PROPOSAL_SCHEMA=schemas.blue;
export const RED_CHALLENGES_SCHEMA=schemas.red;
export const VERIFIER_SCHEMA=schemas.verifier;
export const BLUE_REBUTTAL_SCHEMA=schemas.rebuttal;
export const BUSINESS_CONTEXT_SCHEMA=schemas.context;
export const SOURCE_INPUT_SCHEMA=schemas.source;
export const HUMAN_REVIEW_SCHEMA=schemas.humanReview;
export function exportGtmSchemas(config: GtmConfig = DEFAULT_GTM_CONFIG) {
  const all=createGtmSchemas(config);
  return Object.fromEntries(Object.entries({...all,rebuttalVerifier:all.verifier}).map(([name,schema])=>[name,{$schema:'https://json-schema.org/draft/2020-12/schema',...schema}]));
}
export const GTM_JSON_SCHEMAS=exportGtmSchemas();
export function assertJsonSchema(schema: JsonSchema, value: unknown, path='$'): void {
  const fail=(reason:string):never=>{throw new SchemaError(`${path}: ${reason}`);};
  if(schema.anyOf){let matched=false;for(const choice of schema.anyOf){try{assertJsonSchema(choice,value,path);matched=true;break;}catch{}}if(!matched)fail('不匹配任何允许结构');}
  const types=Array.isArray(schema.type)?schema.type:[schema.type];
  const matches=(type:string|undefined)=>type==='null'?value===null:type==='array'?Array.isArray(value):type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):type==='integer'?Number.isSafeInteger(value):typeof value===type;
  if(schema.type&&!types.some(matches))fail('类型错误');
  if(schema.enum&&!schema.enum.includes(value as string))fail('枚举值无效');
  if(typeof value==='string'){
    const length=Array.from(value).length;
    if(schema.minLength!==undefined&&(length<schema.minLength||(schema.minLength>0&&!value.trim())))fail('字符串过短或为空');
    if(schema.maxLength!==undefined&&length>schema.maxLength)fail('字符串超过上限');
  }
  if(typeof value==='number'&&(!Number.isFinite(value)||(schema.minimum!==undefined&&value<schema.minimum)||(schema.maximum!==undefined&&value>schema.maximum)))fail('数字超出范围');
  if(Array.isArray(value)){
    if((schema.maxItems!==undefined&&value.length>schema.maxItems)||(schema.minItems!==undefined&&value.length<schema.minItems))fail('数组长度超限');
    if(schema.items)value.forEach((item,i)=>assertJsonSchema(schema.items!,item,`${path}[${i}]`));
  }else if(value!==null&&typeof value==='object'){
    const record=value as Record<string,unknown>;
    for(const key of schema.required??[])if(!Object.hasOwn(record,key))fail(`缺少字段 ${key}`);
    for(const [key,item]of Object.entries(record)){
      if(!Object.hasOwn(schema.properties??{},key)){if(schema.additionalProperties===false)fail(`禁止额外字段 ${key}`);}
      else assertJsonSchema(schema.properties![key],item,`${path}.${key}`);
    }
  }
}
function parse<T>(schema:JsonSchema,payload:unknown):T{assertJsonSchema(schema,payload);return structuredClone(payload) as T;}
function uniqueIds(ids:string[],field:string):void{if(new Set(ids).size!==ids.length)throw new SchemaError(`${field}: ID不得重复。`);}
function validateClaims(claims: RedChallenge['claims'], config:GtmConfig):void{
  for(const claim of claims)for(const citation of claim.citations){
    if(citation.quote.trim().length<3||citation.quote.trim().length>config.text.quoteUtf16)throw new SchemaError('quote 超过旧UTF-16引文长度约束。');
  }
}
export const parseBlueProposal=(payload:unknown,config=DEFAULT_GTM_CONFIG):BlueProposal=>parse(createGtmSchemas(config).blue,payload);
export function parseRedChallenges(payload:unknown,config=DEFAULT_GTM_CONFIG):{challenges:RedChallenge[]}{
  const result=parse<{challenges:RedChallenge[]}>(createGtmSchemas(config).red,payload);
  uniqueIds(result.challenges.map(c=>c.id),'challenges');
  uniqueIds(result.challenges.flatMap(c=>c.claims.map(v=>v.id)),'claims');
  result.challenges.forEach(c=>validateClaims(c.claims,config));return result;
}
export function parseSemanticReviews(payload:unknown,config=DEFAULT_GTM_CONFIG,expectedIds?:readonly string[]):{reviews:SemanticReview[]}{
  const result=parse<{reviews:SemanticReview[]}>(createGtmSchemas(config).verifier,payload);
  uniqueIds(result.reviews.map(r=>r.claimId),'reviews');
  if(expectedIds){uniqueIds([...expectedIds],'expected claims');if(result.reviews.length!==expectedIds.length||result.reviews.some(r=>!expectedIds.includes(r.claimId)))throw new SchemaError('语义审查Claim ID不完整或不匹配。');}
  return result;
}
export function parseBlueRebuttals(payload:unknown,config=DEFAULT_GTM_CONFIG,expectedIds?:readonly string[]):{rebuttals:BlueRebuttal[]}{
  const result=parse<{rebuttals:BlueRebuttal[]}>(createGtmSchemas(config).rebuttal,payload);
  uniqueIds(result.rebuttals.map(r=>r.challengeId),'rebuttals');uniqueIds(result.rebuttals.flatMap(r=>r.claims.map(c=>c.id)),'claims');
  result.rebuttals.forEach(r=>validateClaims(r.claims,config));
  if(expectedIds&&(result.rebuttals.length!==expectedIds.length||result.rebuttals.some(r=>!expectedIds.includes(r.challengeId))))throw new SchemaError('抗辩风险ID不完整或不匹配。');
  return result;
}
export const parseBusinessContext=(payload:unknown,config=DEFAULT_GTM_CONFIG):BusinessContext=>parse(createGtmSchemas(config).context,payload);
export const parseSourceInput=(payload:unknown,config=DEFAULT_GTM_CONFIG):SourceInput=>parse(createGtmSchemas(config).source,payload);
