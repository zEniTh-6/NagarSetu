import { useEffect, useState } from "react";

/** Seconds left until `until` (ms timestamp), updated every second. 0 when done or unset. */
export function useCountdown(until) {
  const left = () => (until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0);
  const [seconds, setSeconds] = useState(left);
  useEffect(() => {
    setSeconds(left());
    if (!until) return undefined;
    const id = setInterval(() => {
      const s = left();
      setSeconds(s);
      if (s === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until]);
  return seconds;
}

export const formatMmSs = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
