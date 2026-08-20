import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/tokens.css";
import "./styles/app.css";
import App from "./App.jsx";
import { AuthProvider } from "./lib/AuthContext.jsx";
import { ThemeProvider } from "./lib/ThemeContext.jsx";
import { ToastProvider } from "./components/state/Toast.jsx";
import ErrorBoundary from "./components/state/ErrorBoundary.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// index.html's inline #pre-boot loader has done its job the moment React
// has mounted enough to paint something of its own (even just
// ProtectedRoute's BootLoader) -- remove it now rather than leaving it
// sitting on top of the real app forever.
document.getElementById("pre-boot")?.remove();
