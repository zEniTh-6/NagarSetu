import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import i18n from "../i18n/index.js";

// Tests run in English regardless of the machine's language.
await i18n.changeLanguage("en");

afterEach(() => {
  cleanup();
});
