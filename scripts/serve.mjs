#!/usr/bin/env node
/* A static server that answers with the headers vercel.json declares, so the app can be tested
   under the policy it will actually be deployed behind. Node builtins only, like everything
   else in scripts/.

   The point is not to be a general Vercel emulator. It is that a CSP which only exists in
   production is a CSP nobody tests, and the first thing it breaks is the thing you shipped. */

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const PORT = Number(process.env.PORT || 5174);

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8']
]);

/* vercel.json sources are path-to-regexp. Only the two forms this project uses are supported -
   a literal path, and a prefix ending in (.*) - and anything else throws rather than being
   quietly treated as a literal, which would silently drop a header in testing while production
   applied it. */
export function compileSource(source) {
  if (source.endsWith('(.*)')) {
    const prefix = source.slice(0, -'(.*)'.length);
    return (pathname) => pathname.startsWith(prefix);
  }

  if (!source.includes('(') && !source.includes(':') && !source.includes('*')) {
    return (pathname) => pathname === source;
  }

  throw new Error('serve.mjs does not understand the vercel.json source "' + source + '"');
}

export function compileRules(config) {
  return (config.headers ?? []).map((rule) => ({
    source: rule.source,
    matches: compileSource(rule.source),
    headers: rule.headers
  }));
}

/* Every matching rule contributes, and a later rule overrides an earlier one for the same
   header. The cache rules in vercel.json are written not to overlap, so nothing actually
   depends on that - but a reader of this file should know which way it falls. */
export function headersFor(rules, pathname) {
  const applied = new Map();

  for (const rule of rules) {
    if (!rule.matches(pathname)) {
      continue;
    }
    for (const header of rule.headers) {
      applied.set(header.key, header.value);
    }
  }

  return Object.fromEntries(applied);
}

/* Resolved against the root and then checked to be inside it, so nothing in a request can
   reach the rest of the disk. The resolve check stays as a second line behind the rejection
   below: decoding and normalizing are easy to get subtly wrong, and reading outside the repo
   is the thing that must never happen. */
function resolveFile(pathname) {
  let decoded;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  /* Belt and braces. A traversal does not normally reach this far: the caller takes pathname
     from new URL(), which resolves dot segments per the URL spec - including the %2e forms -
     so /src/../package.json arrives here already spelled /package.json, exactly as a browser
     and as production would see it. This covers a future caller that passes a raw path. */
  if (decoded.split(/[/\\]/).includes('..')) {
    return null;
  }

  const relative = normalize(decoded).replace(/^[/\\]+/, '');
  const candidate = resolve(ROOT, relative);

  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) {
    return null;
  }

  try {
    const stats = statSync(candidate);
    if (stats.isDirectory()) {
      const index = join(candidate, 'index.html');
      return statSync(index).isFile() ? index : null;
    }
    return stats.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

export async function createProductionServer({ port = PORT, root = ROOT } = {}) {
  const config = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
  const rules = compileRules(config);

  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    const headers = headersFor(rules, pathname);

    const file = resolveFile(pathname);

    if (!file) {
      /* No SPA fallback. The app is one page and the worker handles navigations; answering 200
         for a missing file would hide a broken path in testing. */
      response.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found: ' + pathname);
      return;
    }

    response.writeHead(200, {
      ...headers,
      'Content-Type': TYPES.get(extname(file).toLowerCase()) ?? 'application/octet-stream',
      'Content-Length': statSync(file).size
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(file).pipe(response);
  });

  await new Promise((ready) => server.listen(port, ready));
  return { server, port, url: 'http://127.0.0.1:' + port };
}

/* pathToFileURL, not new URL(argv[1], 'file:'): on Windows argv[1] is C:\path	oile, and
   URL reads the drive letter as a scheme, so the comparison never matches and running this
   file directly would start nothing at all. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url } = await createProductionServer();
  console.log('waypoints, with production headers, at ' + url);
}
