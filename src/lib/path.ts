/**
 * Minimal SVG path -> polygon rasteriser.
 *
 * Silhouettes are authored as SVG `d` strings because curves are far easier to
 * hand-author than point lists. Rasterising them ourselves (rather than via
 * canvas) keeps the pipeline identical in the browser and in Node tests, and
 * keeps it deterministic -- there is no antialiasing to threshold.
 *
 * Supported commands: M L H V C S Q T Z (absolute and relative). Arcs are not
 * supported; the bundled silhouettes are authored without them.
 */

export type Contour = number[]; // flat [x0, y0, x1, y1, ...]

const CURVE_STEPS = 24;

export function flattenPath(d: string): Contour[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const contours: Contour[] = [];
  let cur: Contour = [];

  let i = 0;
  let x = 0, y = 0;      // current point
  let sx = 0, sy = 0;    // subpath start
  let cx = 0, cy = 0;    // last cubic control reflection
  let qx = 0, qy = 0;    // last quadratic control reflection
  let cmd = '';
  let prev = '';

  const num = () => parseFloat(tokens[i++]);
  const push = (px: number, py: number) => { cur.push(px, py); };
  const endContour = () => {
    if (cur.length >= 6) contours.push(cur);
    cur = [];
  };

  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    for (let s = 1; s <= CURVE_STEPS; s++) {
      const t = s / CURVE_STEPS, u = 1 - t;
      push(
        u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      );
    }
    cx = x2; cy = y2; x = x3; y = y3;
  };

  const quad = (x1: number, y1: number, x2: number, y2: number) => {
    for (let s = 1; s <= CURVE_STEPS; s++) {
      const t = s / CURVE_STEPS, u = 1 - t;
      push(u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2);
    }
    qx = x1; qy = y1; x = x2; y = y2;
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i++];
    } else if (cmd === 'M') {
      cmd = 'L'; // implicit lineto after a moveto
    } else if (cmd === 'm') {
      cmd = 'l';
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;

    switch (cmd.toUpperCase()) {
      case 'M': {
        endContour();
        x = num() + ox; y = num() + oy;
        sx = x; sy = y;
        push(x, y);
        break;
      }
      case 'L': { x = num() + ox; y = num() + oy; push(x, y); break; }
      case 'H': { x = num() + ox; push(x, y); break; }
      case 'V': { y = num() + oy; push(x, y); break; }
      case 'C': {
        const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy;
        cubic(x1, y1, x2, y2, num() + ox, num() + oy);
        break;
      }
      case 'S': {
        const smooth = /[CS]/i.test(prev);
        const x1 = smooth ? 2 * x - cx : x;
        const y1 = smooth ? 2 * y - cy : y;
        const x2 = num() + ox, y2 = num() + oy;
        cubic(x1, y1, x2, y2, num() + ox, num() + oy);
        break;
      }
      case 'Q': {
        const x1 = num() + ox, y1 = num() + oy;
        quad(x1, y1, num() + ox, num() + oy);
        break;
      }
      case 'T': {
        const smooth = /[QT]/i.test(prev);
        quad(smooth ? 2 * x - qx : x, smooth ? 2 * y - qy : y, num() + ox, num() + oy);
        break;
      }
      case 'Z': {
        push(sx, sy);
        endContour();
        x = sx; y = sy;
        break;
      }
      default:
        throw new Error(`unsupported path command: ${cmd}`);
    }
    prev = cmd;
  }
  endContour();
  return contours;
}
