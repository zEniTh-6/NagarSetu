// react-i18next setup. All UI text lives in en.json / hi.json / mr.json (same keys in each).
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import hi from "./hi.json";
import mr from "./mr.json";

export const LANGUAGES = [
  { code: "en", nativeName: "English" },
  { code: "hi", nativeName: "हिंदी" },
  { code: "mr", nativeName: "मराठी" },
];
const CODES = LANGUAGES.map((l) => l.code);
const STORAGE_KEY = "nagarsetu.lang";

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (CODES.includes(saved)) return saved;
  } catch {
    // storage blocked: fall through
  }
  const browser = (typeof navigator !== "undefined" && navigator.language ? navigator.language : "en").slice(0, 2);
  return CODES.includes(browser) ? browser : "en";
}

function applyToDocument(lng) {
  if (typeof document !== "undefined") document.documentElement.lang = lng;
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, mr: { translation: mr } },
  lng: initialLanguage(),
  fallbackLng: "en",
  supportedLngs: CODES,
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

applyToDocument(i18n.language);
i18n.on("languageChanged", (lng) => {
  applyToDocument(lng);
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // ignore
  }
});

export default i18n;
