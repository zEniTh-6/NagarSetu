import { Overlay } from "./Overlay.jsx";

/** Sheet that slides up from the bottom (mobile-first action drawer). */
export function BottomSheet(props) {
  return <Overlay {...props} placement="bottom" />;
}
