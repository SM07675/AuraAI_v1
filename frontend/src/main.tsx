import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import { analytics } from "./app/services/analytics";

// Initialize PostHog analytics telemetry
analytics.init();

createRoot(document.getElementById("root")!).render(<App />);