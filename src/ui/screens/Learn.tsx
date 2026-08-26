import { useAppStore } from "@/ui/store/appStore";
import { Button } from "@/ui/components/Button";

// Full three-phase lesson (Watch → Along with me → On your own) lands in v0.6,
// on top of the vision + recognition + scoring layers. This is a placeholder
// so the route resolves during earlier slices.
export function Learn({ signId }: { signId: string }) {
  const go = useAppStore((s) => s.go);
  return (
    <div className="screen">
      <div className="screen__body">
        <p style={{ marginTop: "var(--s-6)" }}>Lesson for {signId} — coming in v0.6.</p>
      </div>
      <div className="action-bar">
        <Button variant="quiet" onClick={() => go({ name: "home" })}>
          Back
        </Button>
      </div>
    </div>
  );
}
