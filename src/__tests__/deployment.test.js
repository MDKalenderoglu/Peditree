/**
 * deployment.test.js — the published site (Cloudflare Pages, docs/PEDITREE_DEPLOYMENT.md)
 * loads only its own files, sends nothing anywhere and stays out of search engines.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const headers = read('public/_headers');
const csp = (headers.match(/Content-Security-Policy: (.*)/) || [])[1] || '';

describe('published site', () => {
  it('the page loads only its own files and can send data nowhere', () => {
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/script-src 'self';/);
    expect(csp).toMatch(/connect-src 'self';/);
    expect(csp).toMatch(/form-action 'none'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    // no other host anywhere in the policy
    expect(csp).not.toMatch(/https?:|\*\.|\s\*[;\s]/);
  });

  it('stays out of search engines during the pilot', () => {
    expect(headers).toMatch(/X-Robots-Tag: noindex, nofollow/);
    expect(read('public/robots.txt')).toMatch(/Disallow: \//);
    expect(read('index.html')).toMatch(/<meta name="robots" content="noindex, nofollow" \/>/);
  });

  it('can be added to a tablet home screen', () => {
    const m = JSON.parse(read('public/manifest.webmanifest'));
    expect(m.lang).toBe('tr');
    expect(m.display).toBe('standalone');
    expect(m.icons.map(i => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(read('index.html')).toMatch(/<link rel="manifest" href="\/manifest.webmanifest" \/>/);
  });

  it('the app says it is not a medical device and sends patient data nowhere', () => {
    const app = read('src/App.jsx');
    expect(app).toMatch(/tıbbi cihaz değildir/);
    expect(app).toMatch(/Hasta bilgisi hiçbir sunucuya gönderilmez/);
  });
});
