/**
 * End-to-end check against a running build.
 *
 * The unit suite decodes the projection computed in Node. This decodes the
 * pixels the browser actually painted, so it covers the rendering path too --
 * canvas scaling, the DOM component, device pixel ratio. A regression that only
 * softens the on-screen code would slip past the unit tests but fail here.
 *
 *   npm run dev &   then   node test/e2e.mjs
 *   APP_URL=... node test/e2e.mjs   to test a built bundle instead
 */
import { chromium } from 'playwright';
import jsQR from 'jsqr';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = process.env.SHOT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'shots');
const URL_ = process.env.APP_URL ?? 'http://localhost:5173';

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
// deviceScaleFactor 2 on purpose: HiDPI is where canvas sizing bugs hide.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));

const settled = () => page.waitForFunction(
  () => ![...document.querySelectorAll('.hint')].some((h) => h.textContent.includes('Rebuilding')),
  null, { timeout: 40000 },
);

await page.goto(URL_, { waitUntil: 'load' });
// Builds run in a worker, so wait for the result rather than a fixed delay.
await page.locator('.verdict.scan').waitFor({ timeout: 40000 });
check('app reports the model scans', await page.locator('.verdict.scan.ok').isVisible());

const PAYLOAD = 'https://example.com/scan-me-from-above';
await page.fill('#payload', PAYLOAD);
await page.fill('#prompt', 'a rocket');
await page.waitForTimeout(400);
await settled();

await page.getByRole('button', { name: 'Top view', exact: true }).click();
await page.waitForTimeout(500);

// Decode the painted canvas. Running the decoder here rather than in the page
// keeps it the exact jsQR build the app's own verifier uses, so a pass means
// the same decoder agrees on both sides.
const shot = await page.evaluate(() => {
  const canvas = document.querySelector('canvas.proj');
  const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  // One byte per pixel: these are pure black and white, so luminance is lossless
  // here and it keeps the bridge payload a quarter of the size.
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4];
  let bin = '';
  for (let i = 0; i < gray.length; i += 8192) {
    bin += String.fromCharCode.apply(null, gray.subarray(i, i + 8192));
  }
  return { b64: btoa(bin), width, height };
});
const gray = Buffer.from(shot.b64, 'base64');
const rgba = new Uint8ClampedArray(shot.width * shot.height * 4);
for (let i = 0; i < gray.length; i++) {
  rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = gray[i];
  rgba[i * 4 + 3] = 255;
}
const res = jsQR(rgba, shot.width, shot.height, { inversionAttempts: 'dontInvert' });
check('rendered top view decodes to the payload', res?.data === PAYLOAD,
  `${shot.width}x${shot.height} -> ${res?.data ?? 'no read'}`);

// The code's real geometry, read from the app rather than assumed: the module
// count changes with the version, and every corner position depends on it.
const codeStat = await page.locator('.stat').filter({ hasText: 'Code' }).locator('dd').innerText();
const moduleCount = Number(/(\d+)²/.exec(codeStat)?.[1]);
check('read the code geometry from the app', Number.isFinite(moduleCount) && moduleCount > 20,
  `${moduleCount} modules`);

// Orientation. A mirrored QR still decodes in jsQR, so the decode above cannot
// catch a flipped model. Finder patterns can: a QR carries them at top-left,
// top-right and bottom-left, never bottom-right. The whole 7x7 is matched
// rather than its centre sampled -- a lone dark module turns up at the empty
// corner about half the time, so a centre sample passes or fails by luck.
const FINDER = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
const QUIET = 4;

const cornersOf = (sel, fromPlate) => page.evaluate(({ sel, n, quiet, pattern, fromPlate }) => {
  const c = document.querySelector(sel);
  const o = document.createElement('canvas');
  o.width = c.width; o.height = c.height;
  o.getContext('2d').drawImage(c, 0, 0);
  const { data, width, height } = o.getContext('2d').getImageData(0, 0, o.width, o.height);

  // The flat projection is the bitmap at an integer scale, so it fills its
  // canvas. The 3D view does not -- the model is framed with margin -- so there
  // the light base plate is found first and the module grid mapped onto it.
  let x0 = 0, y0 = 0, x1 = width - 1, y1 = height - 1;
  if (fromPlate) {
    x0 = width; y0 = height; x1 = -1; y1 = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4] > 150) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return 'no-plate';
  }

  const total = n + quiet * 2;
  const px = (x1 - x0 + 1) / total, py = (y1 - y0 + 1) / total;
  const dark = (mx, my) => {
    const x = Math.floor(x0 + (mx + 0.5) * px), y = Math.floor(y0 + (my + 0.5) * py);
    return data[(y * width + x) * 4] < 110;
  };
  const has = (cx, cy) => {
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 7; col++) {
        if (dark(quiet + cx + col, quiet + cy + r) !== (pattern[r][col] === '1')) return false;
      }
    }
    return true;
  };
  return [has(0, 0), has(n - 7, 0), has(0, n - 7), has(n - 7, n - 7)].map(Number).join('');
}, { sel, n: moduleCount, quiet: QUIET, pattern: FINDER, fromPlate: !!fromPlate });

const printed = await cornersOf('canvas.proj', false);
check('the printed code has finders at TL, TR, BL only', printed === '1110', `TL TR BL BR = ${printed}`);

await page.getByRole('button', { name: '3D model', exact: true }).click();
await page.getByRole('button', { name: 'Top', exact: true }).click();
await page.waitForTimeout(900);
const geometry = await cornersOf('.viewer canvas', true);
check('the model seen from above matches, so it is not mirrored', geometry === printed,
  `geometry ${geometry} vs printed ${printed}`);

// The 3D canvas must fill its box exactly; overflow means the model is pushed
// off-screen on HiDPI displays.
const fit = await page.evaluate(() => {
  const host = document.querySelector('.viewer');
  const c = host.querySelector('canvas');
  return { hw: host.clientWidth, hh: host.clientHeight, cw: c.clientWidth, ch: c.clientHeight, bw: c.width };
});
check('3D canvas fits its container', fit.cw === fit.hw && fit.ch === fit.hh,
  `canvas ${fit.cw}x${fit.ch} in ${fit.hw}x${fit.hh}, backing ${fit.bw}px`);
check('3D canvas uses the HiDPI backing store', fit.bw > fit.cw, `${fit.bw} > ${fit.cw}`);

await page.getByRole('button', { name: 'Angle', exact: true }).click();
await page.waitForTimeout(700);
const coverage = await page.evaluate(() => {
  const c = document.querySelector('.viewer canvas');
  const off = document.createElement('canvas');
  off.width = c.width; off.height = c.height;
  off.getContext('2d').drawImage(c, 0, 0);
  const { data } = off.getContext('2d').getImageData(0, 0, off.width, off.height);
  let bright = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) {
      bright++;
      const x = p % off.width, y = (p / off.width) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { bright, minX, maxX, minY, maxY, w: off.width, h: off.height };
});
check('base plate is visible in the 3D view', coverage.bright > 5000, `${coverage.bright} px`);
check('model is not cropped by the frame',
  coverage.minX > 2 && coverage.minY > 2 && coverage.maxX < coverage.w - 3 && coverage.maxY < coverage.h - 3,
  `x ${coverage.minX}..${coverage.maxX} of ${coverage.w}, y ${coverage.minY}..${coverage.maxY} of ${coverage.h}`);

// Responsiveness. A build is voxelisation plus a QR decode -- a second or more
// of synchronous work -- so it runs in a worker. The test is a controlled
// comparison: the worst gap between animation frames while idle, then again
// during a build. An absolute threshold would measure this environment's
// software WebGL renderer (a uniform ~200 ms per frame at 2x scale) rather than
// anything about the app. Driving the input directly also avoids measuring
// Playwright's own actionability waiting, which blocks on each build and so
// reports the very stall it is meant to detect.
const worstFrameGap = (ms) => page.evaluate((ms) => new Promise((res) => {
  const start = performance.now();
  let last = start, worst = 0;
  const tick = () => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
    if (now - start >= ms) res(worst); else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), ms);

const idle = await worstFrameGap(1200);
const during = await page.evaluate(() => {
  const el = document.querySelector('input[type=range]');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const t0 = performance.now();
  for (const v of [0.3, 0.35, 0.4, 0.45, 0.5, 0.55]) {
    setValue.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const dispatched = performance.now() - t0;
  return new Promise((res) => {
    const start = performance.now();
    let last = start, worst = 0;
    const tick = () => {
      const now = performance.now();
      worst = Math.max(worst, now - last);
      last = now;
      const busy = [...document.querySelectorAll('.hint')].some((h) => h.textContent.includes('Rebuilding'));
      if (!busy || now - start > 25000) res({ dispatched, settled: now - start, worst });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
});
check('rapid input is accepted without stalling', during.dispatched < 200,
  `six changes in ${during.dispatched.toFixed(0)} ms`);
check('building does not stall the page beyond idle rendering', during.worst < idle * 2 + 200,
  `worst frame ${during.worst.toFixed(0)} ms building vs ${idle.toFixed(0)} ms idle (settled in ${during.settled.toFixed(0)} ms)`);
check('and it settles to a valid design', await page.locator('.verdict.scan.ok').isVisible());

// Printability is a first-class result, not a footnote: the code's module grid
// is also the sculpture's resolution, so it is easy to produce something
// beautiful that no FDM printer can hold. The defaults must land on the right
// side of that.
const printVerdict = await page.locator('.verdict.print').innerText();
check('the app reports the design as printable at the defaults',
  await page.locator('.verdict.print.ok').isVisible(),
  printVerdict.replace(/\n/g, ' · '));

check('no page errors', errors.length === 0, errors.join(' | '));

await page.screenshot({ path: join(OUT, 'e2e-model.png') }).catch(() => {});
await browser.close();
console.log(failures ? `\n${failures} FAILURES\n` : '\nAll e2e checks passed\n');
process.exit(failures ? 1 : 0);
