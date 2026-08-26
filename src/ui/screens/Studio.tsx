import { useAppStore } from "@/ui/store/appStore";
import { Button } from "@/ui/components/Button";

// Studio mode (Part 6 v0.3) — record exemplars from a Deaf ISL signer — lands
// on top of the vision layer. Placeholder route until v0.3.
export function Studio() {
  const go = useAppStore((s) => s.go);
  return (
    <div className="screen">
      <div className="screen__body">
        <p style={{ marginTop: "var(--s-6)" }}>Studio — coming in v0.3.</p>
      </div>
      <div className="action-bar">
        <Button variant="quiet" onClick={() => go({ name: "home" })}>
          Back
        </Button>
      </div>
    </div>
  );
}
