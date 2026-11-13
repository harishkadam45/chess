"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

/** Lazy-loads the WebGL hero so the rest of the landing page paints immediately. */
export function HeroLoader() {
  const [quality, setQuality] = useState<"high" | "low" | null>(null);
  useEffect(() => {
    const low = (navigator.hardwareConcurrency ?? 8) < 4 || matchMedia("(prefers-reduced-motion: reduce)").matches;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("quality");
    } catch {}
    setQuality(saved === "low" || saved === "high" ? saved : low ? "low" : "high");
  }, []);
  return quality ? <HeroScene quality={quality} /> : null;
}
