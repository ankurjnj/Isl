/**
 * End-to-end check against the running dev server.
 *
 * The unit suite decodes the projection computed in Node. This decodes the
 * pixels the browser actually painted, so it covers the rendering path too --
 * canvas scaling, the DOM component, device pixel ratio. A regression that
 * only softens the on-screen code would slip past the unit tests but fail here.
 *
 *   npm run dev &   then   node test/e2e.mjs
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

await page.goto(URL_, { waitUntil: 'load' });
await page.waitForTimeout(1500);

const PAYLOAD = 'https://example.com/scan-me-from-above';
await page.fill('#payload', PAYLOAD);
await page.fill('#prompt', 'a rocket');
await page.waitForFunction(() =>
  ![...document.querySelectorAll('.hint')].some((h) => h.textContent.includes('Rebuilding')),
  null, { timeout: 30000 });

check('app reports the model scans', await page.locator('.verdict.ok').isVisible());

await page.getByRole('button', { name: 'Top view', exact: true }).click();
await page.waitForTimeout(500);

// Pull the painted pixels back and decode them here. Running the decoder in
// Node rather than in the page keeps it the exact same jsQR build the app's
// verifier uses, so a pass means the same decoder agrees on both sides.
const shot = await page.evaluate(() => {
  const canvas = document.querySelector('canvas.proj');
  const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  // One byte per pixel: these are pure black-and-white, so luminance is lossless
  // here and it keeps the bridge payload a quarter of the size.
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4];
  // Spreading 300k+ args into fromCharCode overflows the call stack, so build
  // the string in chunks.
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
check('rendered top view decodes to the payload', res?.data === PAYLOAD, `${shot.width}x${shot.height} -> ${res?.data ?? 'no read'}`);

// The 3D canvas must fill its box exactly; overflow here means the model is
// pushed off-screen on HiDPI displays.
await page.getByRole('button', { name: '3D model', exact: true }).click();
await page.waitForTimeout(700);
const fit = await page.evaluate(() => {
  const host = document.querySelector('.viewer');
  const c = host.querySelector('canvas');
  return { hw: host.clientWidth, hh: host.clientHeight, cw: c.clientWidth, ch: c.clientHeight, bw: c.width };
});
check('3D canvas fits its container', fit.cw === fit.hw && fit.ch === fit.hh, `canvas ${fit.cw}x${fit.ch} in ${fit.hw}x${fit.hh}, backing ${fit.bw}px`);
check('3D canvas uses the HiDPI backing store', fit.bw > fit.cw, `${fit.bw} > ${fit.cw}`);

// The model must actually be in frame, not cropped at an edge.
const coverage = await page.evaluate(() => {
  const c = document.querySelector('.viewer canvas');
  const off = document.createElement('canvas');
  off.width = c.width; off.height = c.height;
  off.getContext('2d').drawImage(c, 0, 0);
  const { data } = off.getContext('2d').getImageData(0, 0, off.width, off.height);
  // The base plate is near-white; nothing else in the scene is.
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
check('model is not cropped by the frame', coverage.minX > 2 && coverage.minY > 2 && coverage.maxX < coverage.w - 3 && coverage.maxY < coverage.h - 3,
  `x ${coverage.minX}..${coverage.maxX} of ${coverage.w}, y ${coverage.minY}..${coverage.maxY} of ${coverage.h}`);

// Orientation. A mirrored QR still decodes in jsQR, so the decode check above
// cannot catch a flipped model. The finder patterns can: a QR carries them at
// top-left, top-right and bottom-left, and never at bottom-right. This compares
// the rendered 3D geometry seen from above against the intended code, which is
// the one place a mirror would show up.
// Sample the finder centres, derived from the code's real geometry rather than
// fixed percentages: a finder's centre sits 3.5 modules in from the code's
// edge, and the code sits `quietZone` modules inside the bitmap. Hard-coded
// fractions only happen to land on the finders at one particular module count.
const codeStat = await page.locator('.stat').filter({ hasText: 'Code' }).locator('dd').innerText();
const moduleCount = Number(/(\d+)²/.exec(codeStat)?.[1]);
const QUIET = 4;
const near = (QUIET + 3.5) / (moduleCount + QUIET * 2);
const far = 1 - near;
check('read the code geometry from the app', Number.isFinite(moduleCount) && moduleCount > 20,
  `${moduleCount} modules, finders at ${(near * 100).toFixed(1)}% / ${(far * 100).toFixed(1)}%`);

const finders = async (sel) => page.evaluate(({ sel, near, far }) => {
  const c = document.querySelector(sel);
  const o = document.createElement('canvas');
  o.width = c.width; o.height = c.height;
  o.getContext('2d').drawImage(c, 0, 0);
  const { data, width, height } = o.getContext('2d').getImageData(0, 0, o.width, o.height);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4] > 150) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  const w = x1 - x0, h = y1 - y0;
  const at = (fx, fy) => {
    const i = ((Math.round(y0 + h * fy)) * width + Math.round(x0 + w * fx)) * 4;
    return data[i] < 110 ? 1 : 0;
  };
  return [at(near, near), at(far, near), at(near, far), at(far, far)].join('');
}, { sel, near, far });

await page.getByRole('button', { name: 'Top view', exact: true }).click();
await page.waitForTimeout(500);
const wantCorners = await finders('canvas.proj');
await page.getByRole('button', { name: '3D model', exact: true }).click();
await page.getByRole('button', { name: 'Top', exact: true }).click();
await page.waitForTimeout(900);
const gotCorners = await finders('.viewer canvas');
check('intended code has finders at TL, TR, BL only', wantCorners === '1110', `TL TR BL BR = ${wantCorners}`);
check('printed model is not mirrored', gotCorners === wantCorners, `geometry ${gotCorners} vs intended ${wantCorners}`);

// Responsiveness. A build is voxelisation plus a QR decode -- seconds of
// synchronous work -- so it runs in a worker. The test is a controlled
// comparison: measure the worst gap between animation frames while idle, then
// again during a build. An absolute threshold would measure this environment's
// software WebGL renderer (a uniform ~180 ms per frame at 2x scale) rather than
// anything about the app. The build blocking the thread would show up as the
// during-build figure dwarfing the idle one.
await page.getByRole('button', { name: '3D model', exact: true }).click();
await page.waitForTimeout(500);

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

const during = await page.evaluate(async () => {
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
      if (!busy || now - start > 20000) res({ dispatched, settled: now - start, worst });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
});

check('rapid input is accepted without stalling', during.dispatched < 200,
  `six changes in ${during.dispatched.toFixed(0)} ms`);
check('building does not stall the page beyond idle rendering', during.worst < idle * 2 + 200,
  `worst frame ${during.worst.toFixed(0)} ms building vs ${idle.toFixed(0)} ms idle (settled in ${during.settled.toFixed(0)} ms)`);
check('and it settles to a valid design', await page.locator('.verdict.ok').isVisible());

check('no page errors', errors.length === 0, errors.join(' | '));

await page.screenshot({ path: join(OUT, 'e2e-model.png') }).catch(() => {});
await browser.close();
console.log(failures ? `\n${failures} FAILURES\n` : '\nAll e2e checks passed\n');
process.exit(failures ? 1 : 0);
