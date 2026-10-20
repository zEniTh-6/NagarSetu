import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import i18n from "../i18n/index.js";

// Tests run in English regardless of the machine's language.
await i18n.changeLanguage("en");

// jsdom has no object URLs or scrolling.
if (!URL.createObjectURL) URL.createObjectURL = () => "blob:test-preview";
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
});
