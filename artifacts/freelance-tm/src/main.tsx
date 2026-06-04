import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/error-boundary";
import App from "./App";
import "./index.css";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

// Configure API client base URL and auth token
// Use VITE_API_URL if explicitly set; otherwise use relative paths so nginx routes /api/ correctly
const API_BASE = import.meta.env.VITE_API_URL || "";
setBaseUrl(API_BASE || null);

setAuthTokenGetter(() => {
  try {
    const tokens = JSON.parse(localStorage.getItem("ftm_tokens") || "{}");
    return tokens.accessToken || null;
  } catch {
    return null;
  }
});

// Initialize Telegram Mini App (if available)
if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
