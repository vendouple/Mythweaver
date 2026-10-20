import type { Metadata, Viewport } from "next";
import { Cinzel, Cormorant_Garamond, Manrope } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "./themes.css";

const display = Cinzel({ subsets: ["latin"], weight: ["500", "700", "900"], variable: "--font-display" });
const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--font-serif" });
const ui = Manrope({ subsets: ["latin"], weight: ["400", "600", "800"], variable: "--font-ui" });

// Campaign skin faces (themes.css), self-hosted latin subsets in ./fonts so a
// table runs offline on the LAN. Not preloaded: a browser only fetches the
// files for the skin a table is actually wearing.
const ffOrbitron = localFont({ src: [{ path: "./fonts/orbitron-500.woff2", weight: "500", style: "normal" }, { path: "./fonts/orbitron-700.woff2", weight: "700", style: "normal" }, { path: "./fonts/orbitron-900.woff2", weight: "900", style: "normal" }], variable: "--ff-orbitron", display: "swap", preload: false });
const ffExo = localFont({ src: [{ path: "./fonts/exo2-400-italic.woff2", weight: "400", style: "italic" }, { path: "./fonts/exo2-400.woff2", weight: "400", style: "normal" }, { path: "./fonts/exo2-500.woff2", weight: "500", style: "normal" }, { path: "./fonts/exo2-600.woff2", weight: "600", style: "normal" }], variable: "--ff-exo", display: "swap", preload: false });
const ffFellSc = localFont({ src: [{ path: "./fonts/fell-sc-400.woff2", weight: "400", style: "normal" }], variable: "--ff-fell-sc", display: "swap", preload: false });
const ffFell = localFont({ src: [{ path: "./fonts/fell-400-italic.woff2", weight: "400", style: "italic" }, { path: "./fonts/fell-400.woff2", weight: "400", style: "normal" }], variable: "--ff-fell", display: "swap", preload: false });
const ffLimelight = localFont({ src: [{ path: "./fonts/limelight-400.woff2", weight: "400", style: "normal" }], variable: "--ff-limelight", display: "swap", preload: false });
const ffTypewriter = localFont({ src: [{ path: "./fonts/special-elite-400.woff2", weight: "400", style: "normal" }], variable: "--ff-typewriter", display: "swap", preload: false });
const ffOswald = localFont({ src: [{ path: "./fonts/oswald-500.woff2", weight: "500", style: "normal" }, { path: "./fonts/oswald-700.woff2", weight: "700", style: "normal" }], variable: "--ff-oswald", display: "swap", preload: false });
const ffRye = localFont({ src: [{ path: "./fonts/rye-400.woff2", weight: "400", style: "normal" }], variable: "--ff-rye", display: "swap", preload: false });
const ffBlackops = localFont({ src: [{ path: "./fonts/black-ops-one-400.woff2", weight: "400", style: "normal" }], variable: "--ff-blackops", display: "swap", preload: false });
const ffAudiowide = localFont({ src: [{ path: "./fonts/audiowide-400.woff2", weight: "400", style: "normal" }], variable: "--ff-audiowide", display: "swap", preload: false });
const ffRajdhani = localFont({ src: [{ path: "./fonts/rajdhani-500.woff2", weight: "500", style: "normal" }, { path: "./fonts/rajdhani-600.woff2", weight: "600", style: "normal" }, { path: "./fonts/rajdhani-700.woff2", weight: "700", style: "normal" }], variable: "--ff-rajdhani", display: "swap", preload: false });
const ffMichroma = localFont({ src: [{ path: "./fonts/michroma-400.woff2", weight: "400", style: "normal" }], variable: "--ff-michroma", display: "swap", preload: false });
const ffGrenze = localFont({ src: [{ path: "./fonts/grenze-gotisch-500.woff2", weight: "500", style: "normal" }, { path: "./fonts/grenze-gotisch-700.woff2", weight: "700", style: "normal" }, { path: "./fonts/grenze-gotisch-900.woff2", weight: "900", style: "normal" }], variable: "--ff-grenze", display: "swap", preload: false });
const ffMarcellus = localFont({ src: [{ path: "./fonts/marcellus-sc-400.woff2", weight: "400", style: "normal" }], variable: "--ff-marcellus", display: "swap", preload: false });
const ffPlayfairSc = localFont({ src: [{ path: "./fonts/playfair-sc-400.woff2", weight: "400", style: "normal" }, { path: "./fonts/playfair-sc-700.woff2", weight: "700", style: "normal" }, { path: "./fonts/playfair-sc-900.woff2", weight: "900", style: "normal" }], variable: "--ff-playfair-sc", display: "swap", preload: false });
const ffPirata = localFont({ src: [{ path: "./fonts/pirata-one-400.woff2", weight: "400", style: "normal" }], variable: "--ff-pirata", display: "swap", preload: false });
const ffZen = localFont({ src: [{ path: "./fonts/zen-antique-400.woff2", weight: "400", style: "normal" }], variable: "--ff-zen", display: "swap", preload: false });
const ffMincho = localFont({ src: [{ path: "./fonts/shippori-mincho-400.woff2", weight: "400", style: "normal" }, { path: "./fonts/shippori-mincho-600.woff2", weight: "600", style: "normal" }], variable: "--ff-mincho", display: "swap", preload: false });
const ffBangers = localFont({ src: [{ path: "./fonts/bangers-400.woff2", weight: "400", style: "normal" }], variable: "--ff-bangers", display: "swap", preload: false });
const ffComic = localFont({ src: [{ path: "./fonts/comic-neue-400-italic.woff2", weight: "400", style: "italic" }, { path: "./fonts/comic-neue-400.woff2", weight: "400", style: "normal" }, { path: "./fonts/comic-neue-700.woff2", weight: "700", style: "normal" }], variable: "--ff-comic", display: "swap", preload: false });
const ffAlfa = localFont({ src: [{ path: "./fonts/alfa-slab-one-400.woff2", weight: "400", style: "normal" }], variable: "--ff-alfa", display: "swap", preload: false });
const ffFredoka = localFont({ src: [{ path: "./fonts/fredoka-500.woff2", weight: "500", style: "normal" }, { path: "./fonts/fredoka-600.woff2", weight: "600", style: "normal" }, { path: "./fonts/fredoka-700.woff2", weight: "700", style: "normal" }], variable: "--ff-fredoka", display: "swap", preload: false });
const ffNunito = localFont({ src: [{ path: "./fonts/nunito-400-italic.woff2", weight: "400", style: "italic" }, { path: "./fonts/nunito-400.woff2", weight: "400", style: "normal" }, { path: "./fonts/nunito-600.woff2", weight: "600", style: "normal" }, { path: "./fonts/nunito-700.woff2", weight: "700", style: "normal" }], variable: "--ff-nunito", display: "swap", preload: false });
const skinFonts = [ffOrbitron, ffExo, ffFellSc, ffFell, ffLimelight, ffTypewriter, ffOswald, ffRye, ffBlackops, ffAudiowide, ffRajdhani, ffMichroma, ffGrenze, ffMarcellus, ffPlayfairSc, ffPirata, ffZen, ffMincho, ffBangers, ffComic, ffAlfa, ffFredoka, ffNunito];

export const metadata: Metadata = {
  title: "Mythweaver — the AI game table",
  description: "A LAN-hosted AI game master. The screen is the stage, your phones are the hands of fate."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#05070d"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fontVars = [display, serif, ui, ...skinFonts].map((font) => font.variable).join(" ");
  return (
    <html lang="en" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
