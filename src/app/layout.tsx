import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Power Rank: who wins?", template: "%s · Power Rank" },
  description:
    "Crowd-voted anime power scaling. Pick the winner of head-to-head matchups; a Bradley-Terry model turns every vote into rankings with honest error bars.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand">
              Power<span>Rank</span>
            </Link>
            <Nav />
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <p>
              A fan-made data project. Not affiliated with or endorsed by the creators or publishers of any series
              listed. Character names are used for identification only; no official artwork is shown.
            </p>
            <p>
              No accounts, no tracking. A signed cookie keeps you to one vote per matchup per day.{" "}
              <Link href="/about">How the rankings work</Link>.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
