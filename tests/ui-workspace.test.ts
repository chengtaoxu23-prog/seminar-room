import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StructuredText } from '../web/components/Discussion';

test('structured discussion preserves code and evidence text without interpreting HTML', () => {
  const text = '- 第一条材料\n- 第二条材料\n\n> 原文引述\n\n```html\n<script>alert("x")</script>\n```\n\n<script>unsafe</script>';
  const html = renderToStaticMarkup(createElement(StructuredText, { text }));
  assert.ok(html.includes('<ul>') && html.includes('<blockquote>') && html.includes('<pre>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('第一条材料') && html.includes('原文引述'));
});
