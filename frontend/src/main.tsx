import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { ThemeProvider, useTheme } from "next-themes";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import App from "./App.tsx";
import { AuthProvider } from "@/auth/AuthProvider";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { LanguageProvider } from "@/context/LanguageContext";
import { Landing } from "@/pages/Landing";
import { LoginPage } from "@/pages/LoginPage";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function GlassyThemeSync() {
  const { theme, resolvedTheme } = useTheme();
  useEffect(() => {
    const active = theme === "system" ? resolvedTheme : theme;
    const lgTheme = active === "dark" || active === "neon" ? "dark" : "light";
    document.documentElement.setAttribute("data-lg-theme", lgTheme);
  }, [theme, resolvedTheme]);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
        themes={["light", "dark", "neon", "glassy"]}
      >
        <GlassyThemeSync />
        <QueryClientProvider client={queryClient}>
          <MotionConfig reducedMotion="user">
            <LanguageProvider>
              <AuthProvider>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route element={<ProtectedRoute />}>
                    <Route path="/app/*" element={<App />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AuthProvider>
            </LanguageProvider>
          </MotionConfig>
        </QueryClientProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
