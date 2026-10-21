// Multipart upload with progress (fetch can't report upload progress, XMLHttpRequest can).
// Same errors as api(): ApiError with NETWORK_ERROR when the connection drops.
import { API_BASE, ApiError, apiFailure } from "./client.js";

/**
 * @param {string} path below /api
 * @param {FormData} form
 * @param {{ onProgress?: (fraction: number) => void, signal?: AbortSignal }} [opts]
 */
export function uploadForm(path, form, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(apiFailure(xhr.status, data, xhr.statusText));
    };
    xhr.onerror = () => reject(new ApiError(0, "NETWORK_ERROR", "Could not reach the server"));
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
