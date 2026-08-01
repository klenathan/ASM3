import { ArrowRight, GraduationCap, LogIn } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signInWithPassword, signUp } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordPattern =
    "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}";

  if (user) {
    return <Navigate to="/feed" replace />;
  }

  const from =
    (location.state as LocationState | null)?.from ?? "/feed";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "sign-up") {
        await signUp(username.trim(), password);
      } else {
        await signInWithPassword(username.trim(), password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : mode === "sign-in"
            ? "Sign-in failed. Check your email and password."
            : "Account creation failed. Check your details and try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
        <div className="flex items-center gap-2 font-display text-lg font-black tracking-tight">
          <span
            className="flex size-8 items-center justify-center rounded-md text-white"
            style={{ background: "var(--stamp)" }}
          >
            R
          </span>
          commonroom
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{mode === "sign-in" ? "Sign in" : "Create local account"}</CardTitle>
            <CardDescription>
              {mode === "sign-in"
                ? "Use your local Cognito account to open your common room."
                : "Local MiniStack accounts are confirmed automatically for development."}
            </CardDescription>
          </CardHeader>

          <form onSubmit={submit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">RMIT email</Label>
                <Input
                  id="username"
                  type="email"
                  autoComplete="email"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="you@example.com"
                  aria-invalid={Boolean(error)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                  minLength={8}
                  pattern={mode === "sign-up" ? passwordPattern : undefined}
                  title="Use 8+ characters with uppercase, lowercase, number, and symbol."
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  aria-invalid={Boolean(error)}
                />
                <p className="text-xs text-muted-foreground">
                  {mode === "sign-up"
                    ? "Use 8+ characters with uppercase, lowercase, number, and symbol."
                    : "Local sign-in uses Cognito running in MiniStack."}
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner className="size-4" />
                    {mode === "sign-in" ? "Signing in…" : "Creating account…"}
                  </>
                ) : (
                  <>
                    <LogIn className="size-4" />
                    {mode === "sign-in" ? "Sign in" : "Create account"}
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
              >
                {mode === "sign-in" ? "Create local account" : "Use existing account"}
              </Button>
              <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <GraduationCap className="size-3.5" />
                Protected by verified RMIT membership
              </p>
            </CardFooter>
          </form>
        </Card>
      </main>
    </div>
  );
}
