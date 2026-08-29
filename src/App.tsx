import { useEffect, useMemo, useRef, useState } from 'react';
import Viewer, { CameraPreset } from './components/Viewer';
import Projection from './components/Projection';
import ModelThumb from './components/ModelThumb';
import { Bitmap } from './lib/bitmap';
import { project } from './lib/voxel';
import { MODELS, getModel, matchModel } from './lib/models3d';
import { DEFAULT_INPUT, exportObj, exportStl, printingNotes, type DesignInput } from './lib/pipeline';
import { useDesign, type WorkerDesign } from './useDesign';
import type { ModelSource } from './lib/source';
import { downloadBlob, imageFileToBitmap, slugify, textToBitmap } from './lib/browser';
import type { EccLevel } from './lib/qr';

/**
 * Hold a value still until edits stop.
 *
 * Building a design is hundreds of milliseconds of voxelisation and a QR
 * decode, run synchronously. Without this, dragging a slider queues one of
 * those per frame and the control itself stops responding.
 */
function useSettled<T>(value: T, delay = 220): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return settled;
}

type ArtSource =
  | { kind: 'library'; id: string }
  | { kind: 'text'; text: string }
  | { kind: 'upload'; name: string; bitmap: Bitmap };

export default function App() {
  const [payload, setPayload] = useState('https://github.com/ankurjnj/Isl');
  const [prompt, setPrompt] = useState('a cat sitting');
  const [art, setArt] = useState<ArtSource>({ kind: 'library', id: 'cat' });
  const [pinned, setPinned] = useState(false);
  const [version, setVersion] = useState(DEFAULT_INPUT.version);
  const [span, setSpan] = useState(DEFAULT_INPUT.span);
  const [detail, setDetail] = useState(DEFAULT_INPUT.xySub);
  const [ecc, setEcc] = useState<EccLevel>('H');
  const [moduleMm, setModuleMm] = useState(DEFAULT_INPUT.moduleMm);
  const [layerMm, setLayerMm] = useState(DEFAULT_INPUT.layerMm);
  const [baseMm, setBaseMm] = useState(DEFAULT_INPUT.baseMm);
  const [nozzleMm, setNozzleMm] = useState(DEFAULT_INPUT.nozzleMm);
  const [selfSupport, setSelfSupport] = useState(DEFAULT_INPUT.selfSupport);
  const [invert, setInvert] = useState(false);
  const [preset, setPreset] = useState<CameraPreset>('angle');
  const [showBase, setShowBase] = useState(true);
  const [tab, setTab] = useState<'model' | 'top' | 'side'>('model');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Resolve the prompt to a shape, unless the user has pinned one explicitly.
  const suggestion = useMemo(() => matchModel(prompt), [prompt]);
  useEffect(() => {
    if (pinned) return;
    if (suggestion) setArt({ kind: 'library', id: suggestion.model.id });
    else if (prompt.trim()) setArt({ kind: 'text', text: prompt.trim().split(/\s+/)[0].toUpperCase() });
  }, [suggestion, prompt, pinned]);

  // What to sculpt, as a serialisable description rather than a closure, so the
  // whole build can be handed to a worker.
  const source = useMemo<ModelSource | null>(() => {
    try {
      if (art.kind === 'library') return { kind: 'library', id: art.id };
      if (art.kind === 'text') return { kind: 'text', bitmap: textToBitmap(art.text) };
      return { kind: 'lathe', bitmap: art.bitmap };
    } catch {
      return null;
    }
  }, [art]);

  // Everything the build depends on, as one value that only changes when one of
  // its parts does. Memoising here is load-bearing, not tidiness: a fresh object
  // literal would differ on every render, so the debounce below would re-arm
  // itself forever and rebuild the design on a timer with no input at all.
  const inputs = useMemo<Omit<DesignInput, 'model'> | null>(
    () => (payload.trim()
      // One control drives both axes: shaping the sculpture finely across but
      // coarsely up its height reads as smeared, not detailed.
      ? { ...DEFAULT_INPUT, payload: payload.trim(), ecc, version, span, xySub: detail, zSub: detail,
          moduleMm, layerMm, baseMm, nozzleMm, selfSupport }
      : null),
    [payload, ecc, version, span, detail, moduleMm, layerMm, baseMm, nozzleMm, selfSupport],
  );
  const settledInputs = useSettled(inputs);
  const settledSource = useSettled(source);
  const { design, error: buildError, pending: building } = useDesign(settledInputs, settledSource);
  const pending = building || settledInputs !== inputs || settledSource !== source;

  const notes = useMemo(
    () => (design && settledInputs ? printingNotes(settledInputs, design) : []),
    [design, settledInputs],
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

  const save = async (data: BlobPart, filename: string, type: string) => {
    try {
      setError(null);
      await downloadBlob(data, filename, type);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not save the file');
    }
  };

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
              <>Using <strong>{getModel(art.id)?.name}</strong>{!pinned && suggestion ? ' — matched from your prompt' : ''}</>
            )}
            {art.kind === 'text' && <>No model matched, so the word <strong>{art.text}</strong> is cast as raised lettering. Pick one below or upload an outline.</>}
            {art.kind === 'upload' && <>Turning <strong>{art.name}</strong> on a lathe</>}
          </div>

          <div className="shapes">
            {MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.name}
                className={'shape' + (art.kind === 'library' && art.id === m.id ? ' on' : '')}
                onClick={() => { setArt({ kind: 'library', id: m.id }); setPinned(true); }}
              >
                <ModelThumb sdf={m.sdf} />
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
          <label className="check">
            <input type="checkbox" checked={selfSupport} onChange={(e) => setSelfSupport(e.target.checked)} />
            Self-supporting — no support material needed
          </label>
          <p className="hint">
            {selfSupport
              ? design && design.report.shavedFraction > 0.01
                ? `Shaves back anything overhanging steeper than 45°, which costs this shape ${(design.report.shavedFraction * 100).toFixed(0)}% of its material. Turn off to keep the full form and print with supports.`
                : 'Shaves back anything overhanging steeper than 45°. This shape barely notices.'
              : `The full shape, overhangs and all — ${design?.report.overhangs ?? 0} cells will need support material.`}
          </p>
        </section>

        <section className="grid2">
          <Field label={`Sculpture size — ${design ? `${design.report.spanModules} of ${design.report.moduleCount} modules` : `${(span * 100).toFixed(0)}%`}`}>
            <input className="range" type="range" min={0.2} max={1} step={0.01} value={span} onChange={(e) => setSpan(+e.target.value)} />
          </Field>
          <Field label={`Detail — ${design ? `${design.report.cellMm.toFixed(2)} mm` : `${detail}×`} per cell`}>
            <input className="range" type="range" min={1} max={4} step={1} value={detail} onChange={(e) => setDetail(+e.target.value)} />
          </Field>
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
          <Field label={`Code grid — v${design?.qr.version ?? version} · ${design?.report.moduleCount ?? '—'} modules`}>
            <input className="range" type="range" min={0} max={20} value={version} onChange={(e) => setVersion(+e.target.value)} />
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
          <Field label="Nozzle">
            <select className="input" value={nozzleMm} onChange={(e) => setNozzleMm(+e.target.value)}>
              <option value={0.2}>0.2 mm</option>
              <option value={0.4}>0.4 mm</option>
              <option value={0.6}>0.6 mm</option>
              <option value={0.8}>0.8 mm</option>
            </select>
          </Field>
        </section>

        {(error ?? buildError) && <div className="alert bad">{error ?? buildError}</div>}
        {pending && !error && !buildError && <div className="hint">Rebuilding…</div>}

        {design && (
          <>
            <section>
              <div className={'verdict scan ' + (design.verify.matches ? 'ok' : 'bad')}>
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
                <Stat k="Code" v={`v${design.qr.version}-${design.qr.ecc} · ${design.report.moduleCount}²`} />
                <Stat k="Size" v={`${design.dims.widthMm.toFixed(0)} × ${design.dims.depthMm.toFixed(0)} × ${design.dims.heightMm.toFixed(0)} mm`} />
                <Stat k="Sculpture" v={`${design.report.spanModules} modules · ${design.dims.figureMm.toFixed(0)} mm`} />
                <Stat k="Shaped at" v={`${design.report.cellMm.toFixed(2)} mm cells`} />
                <Stat k="Coverage" v={`${(design.report.coverageFraction * 100).toFixed(0)}%`} />
                <Stat k="Pattern drift" v="none" />
                <Stat k="Supports" v={`${design.report.supports}`} />
                <Stat k="Pieces" v={`${design.report.looseParts}`} />
                <Stat k="Overhangs" v={design.report.overhangs === 0 ? 'none' : `${design.report.overhangs}`} />
                <Stat k="Triangles" v={`${design.report.triangles.toLocaleString()}`} />
              </dl>

              <div className={'verdict print ' + (design.print.verdict === 'comfortable' ? 'ok' : design.print.verdict === 'tight' ? 'warn' : 'bad')}>
                <strong>
                  {design.print.verdict === 'comfortable' ? 'Comfortable to print'
                    : design.print.verdict === 'tight' ? 'Tight to print' : 'Too fine to print'}
                </strong>
                <span>
                  {design.print.modulePasses.toFixed(1)} nozzle widths per module ·{' '}
                  sculpture shaped at {design.print.cellPasses.toFixed(1)} ·{' '}
                  {design.print.layers} layers · {design.print.isolatedModules} single-module islands
                </span>
              </div>

              {design.warnings.map((w, i) => (
                <div key={i} className="alert warn">{w}</div>
              ))}
            </section>

            <section className="row">
              <button
                className="btn"
                type="button"
                disabled={!design.verify.matches}
                onClick={() => { void save(exportStl(design, name), `${name}.stl`, 'model/stl'); }}
              >
                Download STL
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => { void save(exportObj(design), `${name}.obj`, 'text/plain'); }}
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
              <Projection bitmap={design.code} className="proj" />
              <p className="caption">
                The sculpture carved into the code, seen from directly above. Point your phone at it — this is
                the same image the built-in verifier decodes.
              </p>
            </div>
          )}
          {tab === 'side' && design && (
            <div className="flat">
              <Projection bitmap={figureSide(design)} flipY className="proj" ink="#0b0d11" paper="#ffffff" />
              <p className="caption">
                The sculpture’s exact outline, seen edge-on.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function figureSide(design: WorkerDesign) {
  return project(design.grid).sideAchieved;
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
