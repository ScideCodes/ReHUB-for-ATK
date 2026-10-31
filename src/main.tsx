import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import "./index.css";
import { initTheme } from "./hub/theme";
import { startTranslator } from "./i18n/translator";

initTheme();
startTranslator();

const App = React.lazy(() =>
  import("./App").then(({ App }) => ({ default: App })),
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <React.Suspense
        fallback={
          <main role="status" aria-label="Loading ATK Hub">
            Loading devices…
          </main>
        }
      >
        <App />
      </React.Suspense>
    </ErrorBoundary>
  </React.StrictMode>,
);
