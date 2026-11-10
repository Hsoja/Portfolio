// Security regression tests for the static portfolio.
// Run with: node --test tests/
// No dependencies: only Node's built-in test runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const html = read('index.html');
// HTML without comments (comments may legitimately *mention* forbidden patterns)
const htmlCode = html.replace(/<!--[\s\S]*?-->/g, '');
const js = read('main.js');
const css = read('styles.css');
const headers = read('_headers');

const metaCsp = (html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/) || [])[1];
const parseCsp = (s) => Object.fromEntries(
  s.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...values] = d.split(/\s+/);
    return [name, values.join(' ')];
  }),
);

// Only these external hosts may appear in links.
const ALLOWED_HOSTS = new Set(['github.com', 'hsoja.github.io']);

test('CSP meta tag exists and is strict', () => {
  assert.ok(metaCsp, 'missing CSP meta tag');
  const csp = parseCsp(metaCsp);
  assert.equal(csp['default-src'], "'none'");
  assert.equal(csp['script-src'], "'self'");
  assert.equal(csp['style-src'], "'self'");
  assert.equal(csp['connect-src'], "'none'");
  assert.equal(csp['object-src'], "'none'");
  assert.equal(csp['base-uri'], "'none'");
  assert.equal(csp['form-action'], "'none'");
  assert.doesNotMatch(metaCsp, /unsafe-inline|unsafe-eval|\*|http:/);
});

test('_headers CSP matches the meta CSP (plus frame-ancestors)', () => {
  const line = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'));
  assert.ok(line, 'missing CSP in _headers');
  const fromHeaders = parseCsp(line.split(':').slice(1).join(':'));
  const fromMeta = parseCsp(metaCsp);
  for (const [k, v] of Object.entries(fromMeta)) assert.equal(fromHeaders[k], v, `mismatch in ${k}`);
  assert.equal(fromHeaders['frame-ancestors'], "'none'");
  for (const h of ['Strict-Transport-Security', 'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy', 'Permissions-Policy']) {
    assert.ok(headers.includes(h), `missing header ${h}`);
  }
});

test('no inline scripts, inline styles or inline event handlers', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0);
  for (const [, attrs, body] of scripts) {
    assert.match(attrs, /src="main\.js"/, 'only main.js may be loaded');
    assert.equal(body.trim(), '', 'inline script body found');
  }
  assert.doesNotMatch(htmlCode, /<style\b/i, 'inline <style> block found');
  assert.doesNotMatch(htmlCode, /\sstyle="/i, 'inline style attribute found');
  assert.doesNotMatch(htmlCode, /\son[a-z]+\s*=/i, 'inline event handler found');
  assert.doesNotMatch(htmlCode, /javascript:/i);
});

test('every resource is same-origin (no CDNs, no http://)', () => {
  for (const [, url] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (url.startsWith('#') || url.startsWith('data:')) continue;
    if (url.startsWith('https://')) continue; // links, checked in the next test
    assert.doesNotMatch(url, /^(?:http:|\/\/)/, `insecure or protocol-relative URL: ${url}`);
  }
  const cssNoDataUris = css.replace(/url\(\s*"data:[^"]*"\s*\)|url\(\s*'data:[^']*'\s*\)/g, '');
  for (const [, url] of cssNoDataUris.matchAll(/url\(\s*["']?([^"')]+)/g)) {
    assert.ok(url.startsWith('fonts/') || url.startsWith('data:'), `external CSS resource: ${url}`);
  }
  // <link rel="stylesheet|preload|icon"> must never point to another origin
  for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
    assert.doesNotMatch(tag, /href="https?:/, `external <link>: ${tag}`);
  }
});

test('external links go to allow-listed hosts and use rel="noopener noreferrer"', () => {
  const anchors = [...html.matchAll(/<a\b[^>]*href="(https:\/\/[^"]+)"[^>]*>/g)];
  assert.ok(anchors.length >= 4);
  for (const [tag, url] of anchors) {
    assert.ok(ALLOWED_HOSTS.has(new URL(url).hostname), `unexpected host: ${url}`);
    assert.match(tag, /target="_blank"/);
    assert.match(tag, /rel="noopener noreferrer"/, `missing rel on ${url}`);
  }
});

test('JavaScript has no dangerous sinks, network calls or storage', () => {
  const banned = [
    /\beval\s*\(/, /\bnew\s+Function\b/, /setTimeout\s*\(\s*['"`]/, /setInterval\s*\(\s*['"`]/,
    /\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/,
    /\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /importScripts/,
    /localStorage/, /sessionStorage/, /document\.cookie/, /postMessage/,
  ];
  for (const re of banned) assert.doesNotMatch(js, re, `banned pattern ${re}`);
  assert.match(js, /'use strict'/);
});

test('anti-clickjacking guard is present', () => {
  assert.match(js, /window\.top\s*!==\s*window\.self/);
  assert.match(css, /\.is-framed body\s*\{\s*display:\s*none/);
});

test('no secrets or personal data in public files', () => {
  const all = [html, js, css, headers].join('\n');
  assert.doesNotMatch(all, /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}/i);
  assert.doesNotMatch(all, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/, 'e-mail address found');
  // Phone numbers: +1 519 555 0100, (519) 555-0100, 519-555-0100, 519.555.0100
  assert.doesNotMatch(all, /\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3}[\s.-]?\d{3,4}|\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b/, 'phone number found');
});

test('only self-hosted woff2 fonts are shipped', () => {
  const fonts = readdirSync(join(root, 'fonts'));
  assert.ok(fonts.length > 0);
  for (const f of fonts) assert.match(f, /\.woff2$/);
});

test('read-only page: no forms, inputs, embeds or photos', () => {
  for (const tag of ['form', 'input', 'textarea', 'select', 'iframe', 'embed', 'object', 'img', 'video', 'audio', 'picture']) {
    assert.doesNotMatch(htmlCode, new RegExp(`<${tag}\\b`, 'i'), `<${tag}> found: the page must stay read-only and without photos`);
  }
  assert.doesNotMatch(htmlCode, /<button\b/i, 'buttons are not needed on a read-only page');
});

test('no precise location or device APIs', () => {
  const text = htmlCode + js;
  assert.doesNotMatch(text, /geolocation|getCurrentPosition|watchPosition|mediaDevices|getUserMedia|Notification|serviceWorker/);
  // Cities or addresses would reveal where the owner lives.
  assert.doesNotMatch(htmlCode, /Waterloo|Kitchener|Guelph|Toronto|Ontario|Canad[aá]|\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/);
});
