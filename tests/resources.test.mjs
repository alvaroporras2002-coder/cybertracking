import test from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, embedUrl, videoThumbnailUrl } from '../assets/js/resources.js';

test('unsafe resource URLs cannot become clickable or embedded content', () => {
  for (const url of ['javascript:alert(1)','data:text/html,hello','http://example.com','not a url']) {
    assert.equal(safeUrl(url),null);
    assert.equal(embedUrl(url),null);
    assert.equal(videoThumbnailUrl(url),null);
  }
});

test('specific YouTube video URLs use the same validated ID for poster and playback', () => {
  const id = 'y2kg3MOk1sY';
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}&list=PLvalid_123&t=10`,
    `https://youtu.be/${id}?si=share`,
    `https://www.youtube.com/embed/${id}`,
    `https://youtube.com/shorts/${id}`,
    `https://youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ]) {
    assert.equal(videoThumbnailUrl(url), `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url);
    assert.equal(embedUrl(url), `https://www.youtube-nocookie.com/embed/${id}`, url);
  }
});

test('articles, playlist-only URLs and invalid or spoofed videos never receive a poster', () => {
  for (const url of [
    'https://youtube.com/playlist?list=PLvalid_123',
    'https://youtube.com/watch?list=PLvalid_123',
    'https://www.youtube-nocookie.com/embed/videoseries?list=PLvalid_123',
    'https://vimeo.com/123456789',
    'https://example.com/article?v=y2kg3MOk1sY',
    'https://youtube.com.evil.example/watch?v=y2kg3MOk1sY',
    'https://youtube.com@evil.example/watch?v=y2kg3MOk1sY',
    'https://youtube.com/watch?v=too-short',
    'https://youtube.com/watch?v=y2kg3MOk1sYextra',
    'https://youtu.be/y2kg3MOk1sY/another-path',
    'https://youtube.com/article?v=y2kg3MOk1sY',
    'https://youtube.com:444/watch?v=y2kg3MOk1sY',
  ]) assert.equal(videoThumbnailUrl(url), null, url);
  assert.equal(embedUrl('https://vimeo.com/123456789'), 'https://player.vimeo.com/video/123456789');
  assert.equal(embedUrl('https://youtube.com/watch?list=PLvalid_123'), 'https://www.youtube-nocookie.com/embed/videoseries?list=PLvalid_123');
});
test('only supported video providers are embedded with validated identifiers', () => {
  assert.equal(embedUrl('https://www.youtube.com/watch?v=y2kg3MOk1sY'),'https://www.youtube-nocookie.com/embed/y2kg3MOk1sY');
  assert.equal(embedUrl('https://youtube.com/playlist?list=PLvalid_123'),'https://www.youtube-nocookie.com/embed/videoseries?list=PLvalid_123');
  assert.equal(embedUrl('https://example.com/video'),null);
  assert.equal(embedUrl('https://youtube.com/watch?v=bad'),null);
});
