import { useStrings } from "@/ui/hooks/useStrings";

/**
 * The persistent, honest statement that processing is on-device and video
 * never leaves the phone (Part 7 §11, slice v1.0).
 */
export function PrivacyNote() {
  const t = useStrings();
  return <p className="privacy-note">{t.privacy}</p>;
}
