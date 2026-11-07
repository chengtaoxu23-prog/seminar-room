import type { MaterialSegment } from './types';

const MAX_SEGMENT_CHARS = 760;

/** Normalize newlines without rewriting the material's visible wording. */
export function normalizeMaterial(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitLongBlock(block: string): string[] {
  if (block.length <= MAX_SEGMENT_CHARS) return [block];
  const pieces = block.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n+/g) ?? [block];
  const out: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (!piece.trim()) continue;
    if (current && current.length + piece.length > MAX_SEGMENT_CHARS) {
      out.push(current.trim());
      current = '';
    }
    current += piece;
    while (current.length > MAX_SEGMENT_CHARS * 2) {
      out.push(current.slice(0, MAX_SEGMENT_CHARS).trim());
      current = current.slice(MAX_SEGMENT_CHARS);
    }
  }
  if (current.trim()) out.push(current.trim());
  return out.length > 0 ? out : [block];
}

/**
 * Numbered segments are derived from the raw material. A citation is only ever
 * accepted when its quote is a verbatim substring of one of these segments.
 */
export function segmentMaterial(raw: string): MaterialSegment[] {
  const normalized = normalizeMaterial(raw);
  if (!normalized) return [];

  let blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 1) {
    const lines = normalized
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 1 && lines.every((line) => line.length < 500)) {
      blocks = lines;
    }
  }

  const expanded = blocks.flatMap(splitLongBlock);
  return expanded.map((text, index) => ({
    id: index + 1,
    text,
    chars: text.length,
  }));
}

function terms(text: string): string[] {
  const lower = text.toLowerCase();
  const result = new Set<string>();
  for (const word of lower.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? []) {
    result.add(word);
  }
  for (const run of lower.match(/[\u3400-\u9fff]+/g) ?? []) {
    if (run.length === 1) result.add(run);
    for (let index = 0; index < run.length - 1; index += 1) {
      result.add(run.slice(index, index + 2));
    }
  }
  return [...result];
}

/** Lightweight, deterministic lexical retrieval. No embeddings or external service. */
export function searchSegments(
  segments: MaterialSegment[],
  query: string,
  limit = 4,
): MaterialSegment[] {
  const queryTerms = terms(query);
  if (queryTerms.length === 0) return segments.slice(0, limit);

  const ranked = segments
    .map((segment) => {
      const haystack = segment.text.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        const first = haystack.indexOf(term);
        if (first >= 0) {
          score += 1 + Math.min(2, haystack.split(term).length - 2) * 0.25;
        }
      }
      return { segment, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.segment.id - right.segment.id);

  if (ranked.length >= Math.min(2, limit)) {
    return ranked.slice(0, limit).map((entry) => entry.segment);
  }
  const chosen = new Map(ranked.map((entry) => [entry.segment.id, entry.segment]));
  for (const segment of segments) {
    if (chosen.size >= limit) break;
    chosen.set(segment.id, segment);
  }
  return [...chosen.values()].sort((a, b) => a.id - b.id);
}

export function formatSegments(segments: MaterialSegment[]): string {
  return segments
    .map((segment) => `【材料 ${segment.id}】\n${segment.text}`)
    .join('\n\n');
}
