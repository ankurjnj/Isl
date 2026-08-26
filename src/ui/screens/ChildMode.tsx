import { useAppStore } from "@/ui/store/appStore";
import { Button } from "@/ui/components/Button";

// "With your child" (Part 4.6) ships in v0.8. Placeholder route for now.
export function ChildMode() {
  const go = useAppStore((s) => s.go);
  return (
    <div className="screen">
      <div className="screen__body">
        <p style={{ marginTop: "var(--s-6)" }}>With your child — coming in v0.8.</p>
      </div>
      <div className="action-bar">
        <Button variant="quiet" onClick={() => go({ name: "home" })}>
          Back
        </Button>
      </div>
    </div>
  );
}
