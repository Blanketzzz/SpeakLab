import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootEl = document.getElementById("root")!;
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
const boot = document.getElementById("boot");
if (boot) boot.style.display = "none";
