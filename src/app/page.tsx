"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data is the truth.</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Streak, Ascend Day, trading, finanze, tempo, corpo e mente — un solo posto.
        </p>
      </div>
      <Card className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <p className="text-2xl">🚧</p>
        <p className="text-sm text-secondary-text">La dashboard Home è in costruzione da parte dei subagent.</p>
        <div className="flex gap-2">
          <Link href="/finanze"><Button variant="outline" size="sm">Finanze</Button></Link>
          <Link href="/trading/trades"><Button variant="outline" size="sm">Trade log</Button></Link>
          <Link href="/impostazioni"><Button variant="outline" size="sm">Impostazioni</Button></Link>
        </div>
      </Card>
    </div>
  );
}
