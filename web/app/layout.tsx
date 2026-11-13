import type { Metadata } from "next";
import { Orbitron } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", display: "swap" });

export const metadata: Metadata = {
  title: "Chessly — play chess online",
  description: "Real-time multiplayer chess with ratings, AI opponents and game analysis.",
};

// Runs before paint: dark is the default, light only if the player chose it.
const themeScript = `try{if(localStorage.getItem("theme")!=="light")document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={orbitron.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
