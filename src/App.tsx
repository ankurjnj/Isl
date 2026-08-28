import { useEffect, useMemo, useRef, useState } from 'react';
import Viewer, { CameraPreset } from './components/Viewer';
import Projection from './components/Projection';
import { Bitmap } from './lib/bitmap';
import { rasterizePath } from './lib/raster';
import { SILHOUETTES, getSilhouette, matchSilhouette } from './lib/silhouettes';
import { DEFAULT_INPUT, buildDesign, exportObj, exportStl, printingNotes, type Design, type DesignInput } from './lib/pipeline';
import { downloadBlob, imageFileToBitmap, slugify, textToBitmap } from './lib/browser';
import type { EccLevel } from './lib/qr';
import type { ViewMode } from './lib/voxel';

type ArtSource =
  | { kind: 'library'; id: string }
  | { kind: 'text'; text: string }
  | { kind: 'upload'; name: string; bitmap: Bitmap };

const SIL_RES = 96;

export default function App() {
  const [payload, setPayload] = useState('https://github.com/ankurjnj/Isl');
  const [prompt, setPrompt] = useState('a cat sitting');
  const [art, setArt] = useState<ArtSource>({ kind: 'library', id: 'cat' });
  const [pinned, setPinned] = useState(false);
  const [mode, setMode] = useState<ViewMode>('shadow');
  const [ecc, setEcc] = useState<EccLevel>('H');
  const [height, setHeight] = useState(DEFAULT_INPUT.height);
  const [moduleMm, setModuleMm] = useState(DEFAULT_INPUT.moduleMm);
  const [layerMm, setLayerMm] = useState(DEFAULT_INPUT.layerMm);
  const [baseMm, setBaseMm] = useState(DEFAULT_INPUT.baseMm);
  const [invert, setInvert] = useState(false);
  const [preset, setPreset] = useState<CameraPreset>('angle');
  const [showBase, setShowBase] = useState(true);
  const [tab, setTab] = useState<'model' | 'top' | 'side'>('model');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Resolve the prompt to a shape, unless the user has pinned one explicitly.
  const suggestion = useMemo(() => matchSilhouette(prompt), [prompt]);
  useEffect(() => {
    if (pinned) return;
    if (suggestion) setArt({ kind: 'library', id: suggestion.silhouette.id });
    else if (prompt.trim()) setArt({ kind: 'text', text: prompt.trim().split(/\s+/)[0].toUpperCase() });
  }, [suggestion, prompt, pinned]);

  const silhouette = useMemo<Bitmap | null>(() => {
    try {
      if (art.kind === 'library') {
        const s = getSilhouette(art.id);
        return s ? rasterizePath(s.d, SIL_RES, SIL_RES) : null;
      }
      if (art.kind === 'text') return textToBitmap(art.text);
      return art.bitmap;
    } catch {
      return null;
    }
  }, [art]);

  const design = useMemo<Design | null>(() => {
    if (!silhouette || !payload.trim()) return null;
    const input: DesignInput = {
      ...DEFAULT_INPUT,
      payload: payload.trim(),
      ecc, mode, height, moduleMm, layerMm, baseMm,
      plinth: Math.max(2, Math.round(height * 0.07)),
      silhouette,
    };
    try {
      setError(null);
      return buildDesign(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [silhouette, payload, ecc, mode, height, moduleMm, layerMm, baseMm]);

  const notes = useMemo(
    () => (design ? printingNotes({ ...DEFAULT_INPUT, payload, ecc, mode, height, moduleMm, layerMm, baseMm, silhouette: silhouette! }, design) : []),
    [design, payload, ecc, mode, height, moduleMm, layerMm, baseMm, silhouette],
  );

  const onUpload = async (file: File) => {
    try {
      const bitmap = await imageFileToBitmap(file, 160, { invert });
      setArt({ kind: 'upload', name: file.name, bitmap });
      setPinned(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not read that image');
    }
  };

  const name = slugify(prompt || payload);

  return (
    <div className="app">
      <aside className="panel">
        <header className="brand">
          <div className="logo" aria-hidden />
          <div>
            <h1>QR3D</h1>
            <p>Scans from above. Sculpture from the side.</p>
          </div>
        </header>

        <section>
          <label className="lbl" htmlFor="payload">Link or text to encode</label>
          <input
            id="payload"
            className="input"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder="https://example.com"
            spellCheck={false}
          />
        </section>

        <section>
          <label className="lbl" htmlFor="prompt">What should it look like from the side?</label>
          <input
            id="prompt"
            className="input"
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); setPinned(false); }}
            placeholder="a rocket taking off"
          />
          <div className="hint">
            {art.kind === 'library' && (
              <>Using <strong>{getSilhouette(art.id)?.name}</strong>{!pinned && suggestion ? ' — matched from your prompt' : ''}</>
            )}
            {art.kind === 'text' && <>No shape matched, so the word <strong>{art.text}</strong> will be extruded. Pick one below or upload an image.</>}
            {art.kind === 'upload' && <>Using uploaded image <strong>{art.name}</strong></>}
          </div>

          <div className="shapes">
            {SILHOUETTES.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.name}
                className={'shape' + (art.kind === 'library' && art.id === s.id ? ' on' : '')}
                onClick={() => { setArt({ kind: 'library', id: s.id }); setPinned(true); }}
              >
                <svg viewBox="0 0 100 100" aria-hidden><path d={s.d} fillRule="evenodd" /></svg>
              </button>
            ))}
          </div>

          <div className="row">
            <button className="btn ghost" type="button" onClick={() => fileRef.current?.click()}>Upload image…</button>
            <label className="check">
              <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
              Invert
            </label>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); e.target.value = ''; }}
          />
        </section>

        <section>
          <label className="lbl">Side-view style</label>
          <div className="seg">
            <button className={mode === 'shadow' ? 'on' : ''} onClick={() => setMode('shadow')} type="button">Silhouette</button>
            <button className={mode === 'skyline' ? 'on' : ''} onClick={() => setMode('skyline')} type="button">Skyline</button>
          </div>
          <p className="hint">
            {mode === 'shadow'
              ? 'A true silhouette, holes and all. Detached parts get thin welding posts.'
              : 'Only the upper contour, filled solid beneath. Loses interior detail but always prints as one piece.'}
          </p>
        </section>

        <section className="grid2">
          <Field label="Error correction">
            <select className="input" value={ecc} onChange={(e) => setEcc(e.target.value as EccLevel)}>
              <option value="L">L — 7%</option>
              <option value="M">M — 15%</option>
              <option value="Q">Q — 25%</option>
              <option value="H">H — 30%</option>
            </select>
          </Field>
          <Field label={`Height — ${height} layers`}>
            <input className="range" type="range" min={12} max={80} value={height} onChange={(e) => setHeight(+e.target.value)} />
          </Field>
          <Field label={`Module ${moduleMm.toFixed(1)} mm`}>
            <input className="range" type="range" min={0.8} max={5} step={0.1} value={moduleMm} onChange={(e) => setModuleMm(+e.target.value)} />
          </Field>
          <Field label={`Layer ${layerMm.toFixed(1)} mm`}>
            <input className="range" type="range" min={0.4} max={4} step={0.1} value={layerMm} onChange={(e) => setLayerMm(+e.target.value)} />
          </Field>
          <Field label={`Base ${baseMm.toFixed(1)} mm`}>
            <input className="range" type="range" min={0} max={6} step={0.2} value={baseMm} onChange={(e) => setBaseMm(+e.target.value)} />
          </Field>
        </section>

        {error && <div className="alert bad">{error}</div>}

        {design && (
          <>
            <section>
              <div className={'verdict ' + (design.verify.matches ? 'ok' : 'bad')}>
                <strong>{design.verify.matches ? 'Scans correctly' : 'Does not scan'}</strong>
                <span>
                  {design.verify.matches
                    ? 'The model’s top-down projection was decoded and matches your link.'
                    : design.verify.decoded
                      ? `Decoded as “${design.verify.decoded}”.`
                      : 'A QR decoder could not read the top view.'}
                </span>
              </div>

              <dl className="stats">
                <Stat k="Code" v={`v${design.qr.version}-${design.qr.ecc} · ${design.qr.moduleCount}²`} />
                <Stat k="Size" v={`${design.dims.widthMm.toFixed(0)} × ${design.dims.depthMm.toFixed(0)} × ${design.dims.heightMm.toFixed(0)} mm`} />
                <Stat k="Side fidelity" v={`${(design.build.report.sideFidelity * 100).toFixed(0)}%`} />
                <Stat k="Pieces" v={`${design.build.report.looseParts}`} />
                <Stat k="Welds" v={`${design.build.report.struts}`} />
                <Stat k="Triangles" v={`${(design.mesh.body.triangleCount + design.mesh.base.triangleCount).toLocaleString()}`} />
              </dl>

              {design.warnings.map((w, i) => (
                <div key={i} className="alert warn">{w}</div>
              ))}
            </section>

            <section className="row">
              <button
                className="btn"
                type="button"
                disabled={!design.verify.matches}
                onClick={() => downloadBlob(exportStl(design, name), `${name}.stl`, 'model/stl')}
              >
                Download STL
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => downloadBlob(exportObj(design), `${name}.obj`, 'text/plain')}
              >
                OBJ
              </button>
            </section>

            <details className="notes">
              <summary>How to print it</summary>
              <ol>{notes.map((n, i) => <li key={i}>{n}</li>)}</ol>
            </details>
          </>
        )}
      </aside>

      <main className="stage">
        <div className="stagebar">
          <div className="seg">
            <button className={tab === 'model' ? 'on' : ''} onClick={() => setTab('model')} type="button">3D model</button>
            <button className={tab === 'top' ? 'on' : ''} onClick={() => setTab('top')} type="button">Top view</button>
            <button className={tab === 'side' ? 'on' : ''} onClick={() => setTab('side')} type="button">Side view</button>
          </div>
          {tab === 'model' && (
            <div className="stagebar-right">
              <div className="seg">
                <button className={preset === 'angle' ? 'on' : ''} onClick={() => setPreset('angle')} type="button">Angle</button>
                <button className={preset === 'top' ? 'on' : ''} onClick={() => setPreset('top')} type="button">Top</button>
                <button className={preset === 'side' ? 'on' : ''} onClick={() => setPreset('side')} type="button">Side</button>
              </div>
              <label className="check">
                <input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} />
                Base plate
              </label>
            </div>
          )}
        </div>

        <div className="stagebody">
          {tab === 'model' && <Viewer design={design} preset={preset} showBase={showBase} />}
          {tab === 'top' && design && (
            <div className="flat">
              <Projection bitmap={design.build.topAchieved} className="proj" />
              <p className="caption">
                The model’s exact projection along the vertical axis. Point your phone at it — this is the
                same image the built-in verifier decodes.
              </p>
            </div>
          )}
          {tab === 'side' && design && (
            <div className="flat">
              <Projection bitmap={design.build.sideAchieved} flipY className="proj" ink="#0b0d11" paper="#ffffff" />
              <p className="caption">
                The exact projection along the depth axis — the outline you see edge-on.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="stat">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
