import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Design } from '../lib/pipeline';

export type CameraPreset = 'top' | 'side' | 'angle';

/**
 * The camera is orthographic, and that is not a stylistic choice.
 *
 * The whole illusion is defined for parallel projection: `V = QR AND S` makes
 * the *orthographic* shadows come out right. Under perspective the rays
 * diverge, so modules near the edge of the code would be seen past and the
 * QR would smear. An orthographic view is what the print's two readings
 * actually are.
 */
const PRESETS: Record<CameraPreset, [number, number, number]> = {
  // Straight down would leave the camera's roll undefined against a Z-up
  // control axis, so the top preset is nudged a fraction of a degree off
  // vertical. Under orthographic projection the difference is not visible.
  top: [0, -0.02, 1],
  side: [0, -1, 0.02],
  angle: [0.75, -1, 0.65],
};

interface Props {
  design: Design | null;
  preset: CameraPreset;
  showBase: boolean;
}

export default function Viewer({ design, preset, showBase }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    controls: OrbitControls;
    group: THREE.Group;
    radius: number;
  } | null>(null);

  // Scene setup, once.
  useEffect(() => {
    const host = hostRef.current!;
    // preserveDrawingBuffer keeps the frame readable after compositing, so the
    // canvas can be captured (screenshots, automated checks) rather than coming
    // back blank or stale.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
    camera.up.set(0, 0, 1); // Z is up in model space.

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;

    scene.add(new THREE.HemisphereLight(0xe8eefb, 0x2b313d, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-60, -90, 120);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 0.9);
    rim.position.set(80, 60, 30);
    scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);

    const state = { renderer, scene, camera, controls, group, radius: 100 };
    stateRef.current = state;

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      // updateStyle must stay on: with a device pixel ratio above 1 the backing
      // store is larger than the layout box, and skipping the CSS size leaves
      // the canvas laid out at its full backing-store size, overflowing the
      // panel and pushing the model off-screen on every HiDPI display.
      renderer.setSize(w, h);
      const aspect = w / h;
      const r = state.radius;
      camera.left = -r * aspect;
      camera.right = r * aspect;
      camera.top = r;
      camera.bottom = -r;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, []);

  // Rebuild geometry whenever the design changes.
  useEffect(() => {
    const state = stateRef.current;
    if (!state || !design) return;
    const { group } = state;

    for (const child of [...group.children]) {
      group.remove(child);
      const m = child as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose();
    }

    const make = (
      positions: Float32Array,
      normals: Float32Array,
      material: THREE.Material,
    ) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      return new THREE.Mesh(g, material);
    };

    // Deep matte for the code, near-white for the plate: the same contrast the
    // print needs, so the preview does not flatter a design that will not scan.
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x191c22, roughness: 0.9, metalness: 0.02 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xeef1f6, roughness: 0.85, metalness: 0.0 });

    group.add(make(design.mesh.body.positions, design.mesh.body.normals, bodyMat));
    if (showBase) group.add(make(design.mesh.base.positions, design.mesh.base.normals, baseMat));

    const { widthMm, depthMm, heightMm } = design.dims;
    group.position.set(-widthMm / 2, -depthMm / 2, -heightMm / 2);
  }, [design, showBase]);

  // Camera presets, each framed to what that view actually spans.
  useEffect(() => {
    const state = stateRef.current;
    if (!state || !design) return;
    const { widthMm: w, depthMm: d, heightMm: h } = design.dims;

    // Framing every preset to the bounding sphere would leave the two views
    // that matter -- straight down and edge-on -- floating in empty space, since
    // neither spans the model's diagonal. Each axis-aligned preset is framed to
    // its own projected extent; only the free-orbit view needs the sphere,
    // because the user can rotate it to any angle.
    const half: [number, number] =
      preset === 'top' ? [w / 2, d / 2]
      : preset === 'side' ? [w / 2, h / 2]
      : [Math.hypot(w, d, h) / 2, Math.hypot(w, d, h) / 2];

    const host = hostRef.current!;
    const aspect = (host.clientWidth || 1) / (host.clientHeight || 1);
    const radius = Math.max(half[1], half[0] / aspect) * 1.14;
    state.radius = radius;

    state.camera.left = -radius * aspect;
    state.camera.right = radius * aspect;
    state.camera.top = radius;
    state.camera.bottom = -radius;
    state.camera.updateProjectionMatrix();

    const [px, py, pz] = PRESETS[preset];
    const len = Math.hypot(px, py, pz);
    // Orthographic: distance does not affect scale, it only has to clear the
    // model so nothing is cut by the near plane.
    const dist = Math.hypot(w, d, h) * 2;
    state.camera.position.set((px / len) * dist, (py / len) * dist, (pz / len) * dist);
    state.controls.target.set(0, 0, 0);
    state.controls.update();
  }, [preset, design]);

  return <div className="viewer" ref={hostRef} />;
}
