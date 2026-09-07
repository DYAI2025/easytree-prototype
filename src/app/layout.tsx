import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "../ui/app-shell/app-shell";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "EasyTree Prototyp",
  description: "Baustellenzentrierter Admin-Planungsprototyp (PROTOTYPE_ONLY)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
