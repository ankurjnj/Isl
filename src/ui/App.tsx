import { useAppStore } from "@/ui/store/appStore";
import { useRemotePack } from "@/ui/hooks/useRemotePack";
import { Onboarding } from "@/ui/screens/Onboarding";
import { Menu } from "@/ui/screens/Menu";
import { LearnDigital } from "@/ui/screens/LearnDigital";
import { TestConverse } from "@/ui/screens/TestConverse";
import { Studio } from "@/ui/screens/Studio";

export function App() {
  const route = useAppStore((s) => s.route);
  // Pull any newly published signs on open.
  useRemotePack();

  return (
    <div className="app-shell">
      {route.name === "onboard" && <Onboarding />}
      {route.name === "menu" && <Menu />}
      {route.name === "learn" && <LearnDigital />}
      {route.name === "test" && <TestConverse />}
      {route.name === "studio" && <Studio />}
    </div>
  );
}
