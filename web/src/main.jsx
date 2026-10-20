import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fonts are bundled (no Google Fonts request): Inter for Latin, Noto Sans Devanagari for hi/mr.
import "@fontsource-variable/inter";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/500.css";
import "@fontsource/noto-sans-devanagari/600.css";
import "@fontsource/noto-sans-devanagari/700.css";
import "./styles/index.css";
import "./i18n/index.js";
import App from "./App.jsx";
import { createAppRouter } from "./router.jsx";

const router = createAppRouter();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App router={router} />
  </StrictMode>,
);
