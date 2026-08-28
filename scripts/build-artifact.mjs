/**
 * Produce a single self-contained HTML fragment for the hosted preview.
 *
 * The host supplies the doctype, head and body, so this strips that wrapper
 * from the single-file Vite build and keeps only the title, styles and scripts.
 *
 *   node scripts/build-artifact.mjs        (after: vite build -c vite.artifact.config.ts)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SRC = 'dist-artifact/index.html';
const OUT = 'artifact/qr3d.html';

const src = readFileSync(SRC, 'utf8');
const head = /<head>(.*?)<\/head>/s.exec(src)?.[1];
const body = /<body>(.*?)<\/body>/s.exec(src)?.[1];
if (head == null || body == null) throw new Error(`${SRC} is not the expected single-file build`);

// Clean ONLY the markup ahead of the first script tag.
//
// Running a /<meta[^>]*>/ strip over the whole head also matches three.js's
// <metalnessmap_pars_fragment> shader includes and silently guts the fragment
// shader -- the page then renders a blank canvas with no error a user would see.
// Head boilerplate never appears after the first script, so cutting there keeps
// the pattern away from anything executable.
const cut = head.indexOf('<script');
if (cut < 0) throw new Error('expected an inline script in <head>');
const prefix = head
  .slice(0, cut)
  .replace(/<meta\b[^>]*>\s*/g, '')
  .replace(/<title>.*?<\/title>\s*/gs, '');

const out = `<title>QR3D</title>\n${(prefix + head.slice(cut)).trim()}\n${body.trim()}\n`;

for (const tag of ['<!doctype', '<html', '<head', '<body']) {
  if (out.toLowerCase().includes(tag)) throw new Error(`document wrapper survived: ${tag}`);
}
if (out.includes('#include #include')) throw new Error('shader includes were corrupted');
// Guard the failure above in general: stripping must remove head boilerplate
// and nothing else.
const removed = src.length - out.length;
if (removed > 400) throw new Error(`stripped ${removed} bytes; expected only head boilerplate`);

mkdirSync('artifact', { recursive: true });
writeFileSync(OUT, out);
console.log(`${OUT}  ${(out.length / 1024).toFixed(0)} KB  (${removed} bytes of boilerplate removed)`);
