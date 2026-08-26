import { useVision, type VisionErrorKind } from "@/vision/useVision";
import { useStrings } from "@/ui/hooks/useStrings";
import { Button } from "./Button";
import type { RawFrame } from "@/landmarks/types";

/**
 * The framed, mirrored camera view with the skeleton overlay (Part 6 v0.1),
 * reused by Studio, the lesson phases, and child mode. Optionally shows the
 * FPS/latency readout used to validate v0.1's ≥20fps target on a real phone.
 */
export function CameraView(props: {
  enabled: boolean;
  onFrame?: (frame: RawFrame) => void;
  dev?: boolean;
}) {
  const t = useStrings();
  const { videoRef, canvasRef, status, error, fps, latency, retry } = useVision({
    enabled: props.enabled,
    onFrame: props.onFrame,
  });

  if (status === "error" && error) {
    return <VisionError kind={error} onRetry={retry} />;
  }

  return (
    <>
      <div className="camera-frame">
        {/* No captions: the camera stream has no audio track (Part 7 §2). */}
        <video ref={videoRef} />
        <canvas ref={canvasRef} />
      </div>
      {props.dev && status === "running" && (
        <div className="dev-readout">
          {fps} fps · hand {latency.hand.toFixed(0)}ms · pose {latency.pose.toFixed(0)}ms
        </div>
      )}
      {status === "loading" && <div className="dev-readout">{t.privacy}</div>}
    </>
  );
}

function VisionError({ kind, onRetry }: { kind: VisionErrorKind; onRetry: () => void }) {
  const t = useStrings();
  const message =
    kind === "no_camera"
      ? t.errors.noCamera
      : kind === "permission_denied"
        ? t.errors.permissionDenied
        : kind === "wasm_failure"
          ? t.errors.wasmFailure
          : t.errors.unsupported;
  return (
    <div>
      <div className="error-state">{message}</div>
      <div style={{ padding: "0 var(--gutter)" }}>
        <Button variant="quiet" onClick={onRetry}>
          {t.feedback.tryAgain}
        </Button>
      </div>
    </div>
  );
}
