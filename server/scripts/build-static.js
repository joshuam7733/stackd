// `npm run build:static` — builds the static DEMO package in ./deploy for Netlify or Vercel.
//
// Static hosts can't run the Node server, so this package runs the same domain code in each visitor's browser
// (saved to IndexedDB): full UI and game flows, but a private demo world per visitor, no shared accounts and no
// Google sign-in. Node-only pieces are swapped for browser stand-ins from ./web-demo.
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../config.js';

const OUT = join(ROOT, 'deploy');
const p = (...x) => join(ROOT, ...x);
const copy = (from, to = from) => cpSync(p(from), join(OUT, to), { recursive: true });

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Frontend (unchanged) + browser transport
copy('assets');
copy('src');
cpSync(p('web-demo/api.js'), join(OUT, 'src/client/api.js'));

// Domain code (unchanged) + browser stand-ins for node:crypto and password hashing
copy('server/domain');
copy('server/integrations');
copy('server/payments');
mkdirSync(join(OUT, 'server/auth'), { recursive: true });
cpSync(p('web-demo/passwords.js'), join(OUT, 'server/auth/passwords.js'));
mkdirSync(join(OUT, 'web-demo'), { recursive: true });
cpSync(p('web-demo/node-crypto.js'), join(OUT, 'web-demo/node-crypto.js'));

// index.html: process shim + import map so `node:crypto` resolves to the browser stand-in
const html = readFileSync(p('index.html'), 'utf8').replace(
  '<meta charset="utf-8" />',
  `<meta charset="utf-8" />
  <!-- STACKD static demo build: the backend runs in this browser (see README → Hosting). -->
  <script>window.process = window.process || { env: {} };</script>
  <script type="importmap">{ "imports": { "node:crypto": "./web-demo/node-crypto.js" } }</script>`,
);
writeFileSync(join(OUT, 'index.html'), html);

// Host config (both read from the package root)
writeFileSync(join(OUT, 'netlify.toml'), '[build]\n  publish = "."\n  command = ""\n');
writeFileSync(join(OUT, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: SAMEORIGIN',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  '  X-Robots-Tag: noindex',
  '',
  '/index.html',
  '  Cache-Control: public, max-age=0, must-revalidate',
  '',
  '/assets/*',
  '  Cache-Control: public, max-age=86400',
  '',
].join('\n'));
writeFileSync(join(OUT, 'vercel.json'), JSON.stringify({
  headers: [
    { source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, { key: 'X-Robots-Tag', value: 'noindex' }] },
    { source: '/', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
  ],
}, null, 2));

if (!existsSync(join(OUT, 'src/client/api.js'))) throw new Error('build failed');
console.log(`[static] demo package written to ${OUT}`);
