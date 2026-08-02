import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  KeyRound,
  LoaderCircle,
} from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ApiError } from "../../features/auth/api";
import { useAuth } from "../../features/auth/auth-context";
import { ForbiddenPage } from "../status";

function Brand() {
  return (
    <Link
      className="font-heading text-xl font-bold tracking-[-0.04em] text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
      to="/"
    >
      <span className="text-primary">RMIT</span> Society
    </Link>
  );
}

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const from =
    typeof location.state?.from === "string" ? location.state.from : "/";

  if (status === "authenticated") return <Navigate to="/" replace />;
  if (status === "forbidden") return <ForbiddenPage />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (caughtError) {
      const nextError =
        caughtError instanceof ApiError
          ? caughtError
          : new ApiError(
              0,
              "UNKNOWN_ERROR",
              "Unable to sign you in right now.",
            );
      if (nextError.status === 403) {
        navigate("/403", { replace: true });
      } else {
        setError(nextError);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between border-b border-foreground/15 px-6 py-5 lg:px-10">
        <Brand />
        <Button
          variant="ghost"
          type="button"
          onClick={() => navigate("/")}
          className="h-9 rounded-none px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Back to landing
        </Button>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)] lg:items-center lg:gap-24 lg:px-10 lg:py-28">
        <section aria-labelledby="sign-in-title">
          <div className="flex items-center gap-3 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
            <span>Access desk</span>
            <span aria-hidden="true" className="text-foreground/35">
              /
            </span>
            <span className="text-muted-foreground">Issue 01</span>
          </div>
          <h1
            id="sign-in-title"
            className="mt-5 max-w-2xl font-heading text-[clamp(3rem,7vw,5.5rem)] leading-[0.92] font-bold tracking-[-0.04em] text-balance"
          >
            Welcome back to the table.
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground">
            Sign in with your approved RMIT identity to return to your
            societies and threads.
          </p>
          <div className="mt-10 flex max-w-md items-center gap-3 border-t border-foreground/15 pt-5 text-sm text-muted-foreground">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check size={16} aria-hidden="true" />
            </span>
            <span>One account. A clearer place to participate.</span>
          </div>
        </section>

        <Card className="rounded-none border-0 bg-card py-0 shadow-none ring-1 ring-foreground/15">
          <CardHeader className="gap-3 border-b border-foreground/15 px-6 py-6 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="bg-foreground px-2 py-1 text-xs font-bold tracking-[0.14em] text-background uppercase">
                Sign in
              </span>
              <span className="h-px flex-1 bg-foreground/15" aria-hidden="true" />
            </div>
            <CardTitle className="font-heading text-2xl tracking-[-0.03em]">
              Enter your details
            </CardTitle>
            <CardDescription>
              Use the RMIT email connected to your account.
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
            <form className="space-y-6" onSubmit={handleSubmit} noValidate>
              {error && (
                <Alert variant="destructive" className="rounded-none">
                  <CircleAlert aria-hidden="true" />
                  <AlertTitle>
                    {error.code === "AUTH_INVALID_CREDENTIALS"
                      ? "That sign-in did not match."
                      : "We could not sign you in."}
                  </AlertTitle>
                  <AlertDescription>{error.message}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label
                  className="text-xs font-semibold tracking-[0.08em] text-foreground uppercase"
                  htmlFor="email"
                >
                  RMIT email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="name@rmit.edu.au"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="h-12 rounded-none bg-background px-4 text-base"
                />
              </div>

              <div className="space-y-2">
                <Label
                  className="text-xs font-semibold tracking-[0.08em] text-foreground uppercase"
                  htmlFor="password"
                >
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="h-12 rounded-none bg-background px-4 text-base"
                />
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting || !email || !password}
                className="h-12 w-full rounded-none px-4 text-base shadow-none"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                    Checking your details…
                  </>
                ) : (
                  <>
                    Enter the forum
                    <ArrowUpRight aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="gap-2 rounded-none border-t border-foreground/15 bg-muted/40 px-6 py-4 text-xs leading-5 text-muted-foreground sm:px-8">
            <KeyRound size={15} aria-hidden="true" />
            <span>Your session stays in a secure browser cookie.</span>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
