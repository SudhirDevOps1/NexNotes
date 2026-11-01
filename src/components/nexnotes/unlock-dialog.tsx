"use client";

import { useState } from "react";
import { Lock, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/lib/store";

export function UnlockScreen() {
  const unlockVault = useApp((s) => s.unlockVault);
  const user = useApp((s) => s.user);
  const signOut = useApp((s) => s.signOut);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await unlockVault(pw);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setBusy(false);
      setPw("");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 nx-fade bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/40 via-background to-background">
      <div className="w-full max-w-sm rounded-xl border bg-card shadow-xl p-6">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="h-12 w-12 rounded-2xl nx-accent-bg flex items-center justify-center mb-3">
            <Lock className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold">Vault locked</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your password to decrypt <span className="font-medium">{user?.email}</span>
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="unlockpw">Password</Label>
            <Input
              id="unlockpw" type="password" autoFocus autoComplete="current-password"
              value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full nx-accent-bg" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Unlock vault
          </Button>
          <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={() => void signOut()}>
            Sign out instead
          </Button>
        </form>
      </div>
    </div>
  );
}
