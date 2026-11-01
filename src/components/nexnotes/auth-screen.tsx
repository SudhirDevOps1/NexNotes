"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, Sparkles, Wifi, Database, Lock, Eye, EyeOff, Zap, KeyRound, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/lib/store";

export function AuthScreen() {
  const signIn = useApp((s) => s.signIn);
  const signUp = useApp((s) => s.signUp);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  /* v2.0 — account 2FA step */
  const [twoFa, setTwoFa] = useState(false);
  const [twoFaCode, setTwoFaCode] = useState("");

  /** 0-4 password strength for the signup meter */
  const strength = (() => {
    const p = password;
    if (!p) return 0;
    let sc = 0;
    if (p.length >= 6) sc++;
    if (p.length >= 10) sc++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) sc++;
    if (/\d/.test(p) || /[^\w\s]/.test(p)) sc++;
    return Math.min(4, sc);
  })();
  const STRENGTH_META = [
    { label: "", color: "bg-muted" },
    { label: "Weak", color: "bg-red-500" },
    { label: "Fair", color: "bg-amber-500" },
    { label: "Good", color: "bg-lime-500" },
    { label: "Strong", color: "bg-emerald-500" },
  ];

  async function doDemo() {
    setError(null);
    setDemoBusy(true);
    try {
      await signIn("demo@nexnotes.app", "NexNotes@2026");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed");
      setDemoBusy(false);
    }
  }

  async function doSignIn(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password, twoFa ? twoFaCode.trim() : undefined);
      setTwoFa(false);
      setTwoFaCode("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      if (msg === "2FA_REQUIRED") {
        setTwoFa(true);
        setError("Two-factor is on for this account — enter the 6-digit code (or a backup code).");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function doSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await signUp(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  function fillDemo() {
    setEmail("demo@nexnotes.app");
    setPassword("NexNotes@2026");
    setError(null);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 nx-fade bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/40 via-background to-background">
      <div className="w-full max-w-md">
        {/* brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl nx-accent-bg flex items-center justify-center shadow-lg shadow-emerald-950/40 mb-4">
            <ShieldCheck className="h-8 w-8 text-white" strokeWidth={2.2} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">NexNotes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Local-first · End-to-end encrypted · Yours forever
          </p>
        </div>

        <div className="rounded-xl border bg-card shadow-xl p-6">
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full mb-5">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={doSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email" type="email" placeholder="you@example.com" autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password" type="password" placeholder="••••••••" autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)} required
                  />
                </div>
                {/* v2.0 — account two-factor step */}
                {twoFa && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2 fade-in duration-200">
                    <Label htmlFor="twofa" className="flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 nx-accent-text" /> Authenticator code
                    </Label>
                    <Input
                      id="twofa" inputMode="numeric" placeholder="123456 or backup code" autoComplete="one-time-code"
                      value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value)} autoFocus
                      className="font-mono tracking-[0.3em]"
                    />
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      onClick={() => { setTwoFa(false); setTwoFaCode(""); setError(null); }}
                    >
                      <ArrowLeft className="h-3 w-3" /> Use password only (turn 2FA off in Settings if you lost your codes)
                    </button>
                  </div>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} {twoFa ? "Verify & sign in" : "Sign in"}
                </Button>
              </form>

              <div className="mt-5 rounded-lg border border-dashed p-3.5 bg-muted/40">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                  <Sparkles className="h-3.5 w-3.5" /> Demo account
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5 font-mono">
                  <p>demo@nexnotes.app</p>
                  <p>NexNotes@2026</p>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-2.5" onClick={fillDemo} type="button">
                  Fill demo credentials
                </Button>
                <Button size="sm" className="w-full mt-2 nx-accent-bg gap-1.5" onClick={() => void doDemo()} type="button" disabled={demoBusy || busy}>
                  {demoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  One-click demo login
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={doSignUp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="remail">Email</Label>
                  <Input
                    id="remail" type="email" placeholder="you@example.com" autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rpassword">Password (min 6 chars)</Label>
                  <div className="relative">
                    <Input
                      id="rpassword" type={showPw ? "text" : "password"} placeholder="••••••••" autoComplete="new-password"
                      value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                      className="pr-10"
                    />
                    <button
                      type="button" onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {strength > 0 && (
                    <div className="flex items-center gap-2 pt-0.5">
                      <div className="flex flex-1 gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <span
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${i <= strength ? STRENGTH_META[strength].color : "bg-muted"}`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground w-10">{STRENGTH_META[strength].label}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rconfirm">Confirm password</Label>
                  <Input
                    id="rconfirm" type="password" placeholder="••••••••" autoComplete="new-password"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Notes stay on this device until you connect — and are encrypted end-to-end when you turn it on.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex items-center justify-center gap-6 mt-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Wifi className="h-3.5 w-3.5" /> Works offline</span>
          <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> AES-256-GCM</span>
          <span className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> SQLite · Neon</span>
        </div>
      </div>
    </div>
  );
}
