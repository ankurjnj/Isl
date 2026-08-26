/**
 * Camera access (Part 6 slice v0.1). getUserMedia at 640×480, front camera.
 * The stream stays on this device — there is no upload path anywhere in the app
 * (Part 7 §11).
 */

export type CameraError = "no_camera" | "permission_denied" | "unsupported";

export class CameraStartError extends Error {
  constructor(readonly kind: CameraError) {
    super(kind);
    this.name = "CameraStartError";
  }
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraStartError("unsupported");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false, // no audio, ever (Part 7 §2)
    });
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new CameraStartError("permission_denied");
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new CameraStartError("no_camera");
    }
    throw new CameraStartError("unsupported");
  }
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
