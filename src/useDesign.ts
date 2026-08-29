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
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new DesignWorker();
    } catch {
      worker = null; // No worker available; fall back to building inline.
    }
    workerRef.current = worker;
    if (!worker) return;

    const finish = (id: number, next: DesignState) => {
      // Ignore anything but the newest request: a slow build started before the
      // user's last edit must not overwrite a newer result.
      if (id !== latest.current) return;
      clearTimeout(timer.current);
      setState(next);
    };

    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; design?: WorkerDesign; error?: string }>) => {
      finish(e.data.id, e.data.ok && e.data.design
        ? { design: e.data.design, error: null, pending: false }
        : { design: null, error: e.data.error ?? 'build failed', pending: false });
    };

    // A worker that dies -- out of memory on a large grid, say -- sends nothing
    // at all. Without these the page would sit on "Rebuilding" forever, which
    // is a worse failure than an error message.
    worker.onerror = (e) => {
      e.preventDefault();
      finish(latest.current, { design: null, error: 'The build ran out of room. Try less detail or a smaller code.', pending: false });
    };
    worker.onmessageerror = () => {
      finish(latest.current, { design: null, error: 'The build result could not be read back.', pending: false });
    };

    return () => {
      clearTimeout(timer.current);
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!input || !source) return;
    const id = ++latest.current;
    setState((s) => ({ ...s, pending: true }));

    const worker = workerRef.current;
    if (worker) {
      worker.postMessage({ id, input, source } satisfies BuildRequest);
      // Last resort. Even a bounded build can be starved or wedged, and no
      // result at all must still end in something the user can act on.
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (id !== latest.current) return;
        setState({ design: null, error: 'The build took too long. Try less detail or a smaller code.', pending: false });
      }, 45000);
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
