"use client";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  return (
    <button
      aria-label="Toggle theme"
      className="btn-ghost !px-3"
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("theme", next ? "dark" : "light");
        } catch {}
        setDark(next);
      }}
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
