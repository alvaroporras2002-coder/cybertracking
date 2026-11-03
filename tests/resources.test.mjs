import test from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, embedUrl } from '../assets/js/resources.js';

test('unsafe resource URLs cannot become clickable or embedded content', () => {
  for (const url of ['javascript:alert(1)','data:text/html,hello','http://example.com','not a url']) {
    assert.equal(safeUrl(url),null);
    assert.equal(embedUrl(url),null);
  }
});
test('only supported video providers are embedded with validated identifiers', () => {
  assert.equal(embedUrl('https://www.youtube.com/watch?v=y2kg3MOk1sY'),'https://www.youtube-nocookie.com/embed/y2kg3MOk1sY');
  assert.equal(embedUrl('https://youtube.com/playlist?list=PLvalid_123'),'https://www.youtube-nocookie.com/embed/videoseries?list=PLvalid_123');
  assert.equal(embedUrl('https://example.com/video'),null);
  assert.equal(embedUrl('https://youtube.com/watch?v=bad'),null);
});
