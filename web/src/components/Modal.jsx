import { Overlay } from "./Overlay.jsx";

/** Centered dialog. `footer` holds the actions (e.g. Cancel + Confirm). */
export function Modal(props) {
  return <Overlay {...props} placement="center" />;
}
