import { Mesh } from './mesh';

/** Binary STL. Chosen over ASCII because these meshes run to tens of thousands
 *  of triangles and ASCII would be roughly six times the size. */
export function meshToStl(mesh: Mesh, header = 'qr3d'): ArrayBuffer {
  const n = mesh.triangleCount;
  const buf = new ArrayBuffer(84 + n * 50);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  const head = new TextEncoder().encode(header.slice(0, 79));
  bytes.set(head, 0);
  view.setUint32(80, n, true);

  let o = 84;
  for (let t = 0; t < n; t++) {
    view.setFloat32(o, mesh.normals[t * 18], true);
    view.setFloat32(o + 4, mesh.normals[t * 18 + 1], true);
    view.setFloat32(o + 8, mesh.normals[t * 18 + 2], true);
    for (let k = 0; k < 9; k++) {
      view.setFloat32(o + 12 + k * 4, mesh.positions[t * 9 + k], true);
    }
    view.setUint16(o + 48, 0, true);
    o += 50;
  }
  return buf;
}

/** Wavefront OBJ, for tools that prefer it (and for eyeballing in a text editor). */
export function meshToObj(mesh: Mesh): string {
  const lines: string[] = ['# qr3d dual-view sculpture'];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    lines.push(`v ${mesh.positions[i].toFixed(4)} ${mesh.positions[i + 1].toFixed(4)} ${mesh.positions[i + 2].toFixed(4)}`);
  }
  for (let t = 0; t < mesh.triangleCount; t++) {
    lines.push(`f ${t * 3 + 1} ${t * 3 + 2} ${t * 3 + 3}`);
  }
  return lines.join('\n') + '\n';
}
