import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { ToastProvider } from "./components/Toast.jsx";
import { useAuthEvents } from "./auth/AuthEvents.jsx";
import { ApiError } from "./api/client.js";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 4xx answers are final; only network/5xx errors are retried.
        retry: (count, err) => count < 2 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
        refetchOnWindowFocus: false,
      },
    },
  });
}

function AuthEvents({ router }) {
  useAuthEvents(router);
  return null;
}

export default function App({ router }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthEvents router={router} />
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
