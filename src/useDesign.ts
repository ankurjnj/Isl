import { useEffect, useRef, useState } from 'react';
import DesignWorker from './lib/design.worker.ts?worker&inline';
import { buildDesign, type DesignInput, type DesignView } from './lib/pipeline';
import { resolveSource, type ModelSource } from './lib/source';
import type { BuildRequest } from './lib/design.worker';

/** What the UI gets back. */
export type WorkerDesign = DesignView;

export interface DesignState {
  design: WorkerDesign | null;
  error: string | null;
  pending: boolean;
}

/**
 * Build a design off the main thread, keeping only the newest request.
 *
 * The worker is inlined into the bundle (`?worker&inline`) because the app also
 * ships as one self-contained HTML file, where a separate worker chunk would
 * have nothing to load from.
 */
export function useDesign(input: Omit<DesignInput, 'model'> | null, source: ModelSource | null): DesignState {
  const [state, setState] = useState<DesignState>({ design: null, error: null, pending: true });
  const workerRef = useRef<Worker | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new DesignWorker();
    } catch {
      worker = null; // No worker available; fall back to building inline.
    }
    workerRef.current = worker;
    if (!worker) return;

    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; design?: WorkerDesign; error?: string }>) => {
      // Ignore anything but the newest request: a slow build started before the
      // user's last edit must not overwrite a newer result.
      if (e.data.id !== latest.current) return;
      if (e.data.ok && e.data.design) setState({ design: e.data.design, error: null, pending: false });
      else setState({ design: null, error: e.data.error ?? 'build failed', pending: false });
    };
    return () => { worker?.terminate(); workerRef.current = null; };
  }, []);

  useEffect(() => {
    if (!input || !source) return;
    const id = ++latest.current;
    setState((s) => ({ ...s, pending: true }));

    const worker = workerRef.current;
    if (worker) {
      worker.postMessage({ id, input, source } satisfies BuildRequest);
      return;
    }
    // Inline fallback, so the app still works where workers are unavailable.
    try {
      const model = resolveSource(source);
      if (!model) throw new Error('unknown model');
      if (id === latest.current) {
        setState({ design: buildDesign({ ...input, model }), error: null, pending: false });
      }
    } catch (err) {
      setState({ design: null, error: err instanceof Error ? err.message : String(err), pending: false });
    }
  }, [input, source]);

  return state;
}
