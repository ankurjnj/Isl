import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminApp } from "./AdminApp";
import "@/ui/styles/global.css";
import "@/ui/components/components.css";
import "@/ui/screens/screens.css";
import "./admin.css";

const el = document.getElementById("admin-root");
if (!el) throw new Error("#admin-root not found");

createRoot(el).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
