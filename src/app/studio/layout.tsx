"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { href: "/studio", label: "Panoramica" },
  { href: "/studio/vault", label: "Vault" },
  { href: "/studio/mappe", label: "Mappe" },
];

export default function StudioLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="space-y-4">
      <nav className="flex gap-1.5">
        {TABS.map((t) => {
          const active = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "text-accent border-accent"
                  : "text-secondary-text border-border-strong hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
