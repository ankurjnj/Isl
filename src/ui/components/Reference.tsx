import { useEffect, useRef } from "react";
import type { Sign, Exemplar } from "@/content/schema";
import { SkeletonPlayer } from "./SkeletonPlayer";

/**
 * The reference a parent watches. A real Deaf-signer video when one is attached
 * (streamed on demand, muted — no audio, Part 7 §2); otherwise the recorded
 * exemplar skeleton. Reference videos are never bundled (Part 2 §6).
 */
export function Reference(props: {
  sign: Sign;
  exemplars: Exemplar[];
  slowMo?: boolean;
  angle2?: boolean;
}) {
  const { sign, exemplars, slowMo = false, angle2 = false } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const url = angle2 && sign.angle2Url ? sign.angle2Url : slowMo && sign.slowMoUrl ? sign.slowMoUrl : sign.videoUrl;

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = slowMo && !sign.slowMoUrl ? 0.5 : 1;
  }, [slowMo, sign.slowMoUrl]);

  if (url) {
    return (
      <div className="camera-frame">
        {/* Muted: reference videos carry no audio (Part 7 §2). */}
        <video ref={videoRef} src={url} loop muted autoPlay playsInline />
      </div>
    );
  }

  const frames = exemplars[0]?.frames ?? [];
  return (
    <div className="camera-frame reference-skeleton">
      <SkeletonPlayer frames={frames} slowMo={slowMo} />
    </div>
  );
}
