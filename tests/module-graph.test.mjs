import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the browser module graph uses one URL per module so local state remains a singleton', async () => {
  const root = new URL('../', import.meta.url);
  const html = await readFile(new URL('index.html', root), 'utf8');
  const entry = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
  assert.ok(entry, 'the HTML must declare its application module');
  const seen = new Set(), canonical = new Map();
  async function visit(url) {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    const path = new URL(url); path.search = ''; path.hash = '';
    const previous = canonical.get(path.href);
    assert.ok(!previous || previous === url.href, `Mixed module URLs create independent state instances: ${previous} and ${url.href}`);
    canonical.set(path.href, url.href);
    const source = await readFile(path, 'utf8');
    for (const dependency of source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g)) {
      assert.ok(dependency[1].startsWith('.'), 'production modules must remain self-contained');
      await visit(new URL(dependency[1], url));
    }
  }
  await visit(new URL(entry[1], root));
  assert.ok([...canonical.keys()].some(url => url.endsWith('/storage.js')));
  assert.ok(canonical.size >= 10, 'the entire application graph must be traversed');
});
