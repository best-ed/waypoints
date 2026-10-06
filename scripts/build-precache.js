#!/usr/bin/env node
/* Writes precache-manifest.js from what is on disk. Run it after changing any shipped file:
   npm run precache. The pre-commit hook runs the suite, which fails if you forget. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildPrecache, PRECACHE_FILE, renderPrecache } from './precache.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const precache = buildPrecache(root);

writeFileSync(join(root, PRECACHE_FILE), renderPrecache(precache), 'utf8');

console.log(
  PRECACHE_FILE +
    ': version ' +
    precache.version +
    ', ' +
    precache.entries.length +
    ' files, ' +
    precache.remote.length +
    ' pinned cdn urls'
);
