import { useState } from "react";

type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );

  const toggle = () => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      try {
        localStorage.setItem("theme", next);
      } catch {
        // ignore localStorage errors in restricted environments
      }
      return next;
    });
  };

  return { theme, toggle };
}
