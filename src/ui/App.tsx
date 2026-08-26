import { useAppStore } from "@/ui/store/appStore";
import { Onboarding } from "@/ui/screens/Onboarding";
import { Home } from "@/ui/screens/Home";
import { Learn } from "@/ui/screens/Learn";
import { ChildMode } from "@/ui/screens/ChildMode";
import { Studio } from "@/ui/screens/Studio";

export function App() {
  const route = useAppStore((s) => s.route);

  return (
    <div className="app-shell">
      {route.name === "onboard" && <Onboarding />}
      {route.name === "home" && <Home />}
      {route.name === "learn" && <Learn signId={route.signId} />}
      {route.name === "child" && <ChildMode />}
      {route.name === "studio" && <Studio />}
    </div>
  );
}
