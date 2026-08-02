import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  KeyRound,
  LoaderCircle,
} from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { LogoMark } from "../../components/site/LogoMark";
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = {
  displayName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

const EMPTY_ERRORS: FieldErrors = {};

function validate(
  displayName: string,
  email: string,
  password: string,
  confirmPassword: string,
): FieldErrors {
  const errors: FieldErrors = {};

  if (displayName.trim().length === 0) {
    errors.displayName = "Enter a display name.";
  } else if (displayName.trim().length > 80) {
    errors.displayName = "Display name must be 80 characters or fewer.";
  }

  if (email.trim().length === 0) {
    errors.email = "Enter your RMIT email.";
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (password.length === 0) {
    errors.password = "Choose a password.";
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  } else if (password.length > 128) {
    errors.password = "Password must be 128 characters or fewer.";
  }

  if (confirmPassword.length === 0) {
    errors.confirmPassword = "Confirm your password.";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

function FieldErrorIcon() {
  return <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { status, register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(EMPTY_ERRORS);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (status === "authenticated") return <Navigate to="/" replace />;
  if (status === "forbidden") return <ForbiddenPage />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const errors = validate(displayName, email, password, confirmPassword);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await register({ displayName: displayName.trim(), email: email.trim(), password });
      navigate("/", { replace: true });
    } catch (caughtError) {
      const nextError =
        caughtError instanceof ApiError
          ? caughtError
          : new ApiError(0, "UNKNOWN_ERROR", "Unable to create your account right now.");
      if (nextError.status === 403) {
        navigate("/403", { replace: true });
      } else {
        setSubmitError(nextError);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function serverErrorTitle(): string {
    if (submitError === null) return "We could not create your account.";
    switch (submitError.code) {
      case "EMAIL_ALREADY_REGISTERED":
        return "That email already has an account.";
      case "EMAIL_DOMAIN_NOT_ALLOWED":
        return "That email is not approved.";
      case "REGISTRATION_CLOSED":
        return "Registration is currently unavailable.";
      case "NETWORK_ERROR":
      case "SERVICE_UNAVAILABLE":
        return "The service could not be reached.";
      default:
        return "We could not create your account.";
    }
  }

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => (current[field] === undefined ? current : { ...current, [field]: undefined }));
    if (submitError !== null) setSubmitError(null);
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between border-b border-foreground/15 px-6 py-5 lg:px-10">
        <LogoMark />
        <Button
          variant="ghost"
          type="button"
          onClick={() => navigate("/")}
          className="h-11 rounded-none px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Back to landing
        </Button>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)] lg:items-center lg:gap-24 lg:px-10 lg:py-28">
        <section aria-labelledby="register-title">
          <h1
            id="register-title"
            className="max-w-2xl font-heading text-[clamp(2.75rem,6.5vw,5rem)] leading-[0.95] font-semibold tracking-[-0.01em] text-balance uppercase"
          >
            Claim a seat at the table.
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground">
            Create your account with an approved RMIT email to find your
            societies and join the thread.
          </p>
          <div className="mt-10 flex max-w-md items-center gap-3 border-t border-foreground/15 pt-5 text-sm text-muted-foreground">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check size={16} aria-hidden="true" />
            </span>
            <span>Approved RMIT identities only, across AU, VN, and EU.</span>
          </div>
        </section>

        <Card className="rounded-none border-0 bg-card py-0 shadow-none ring-1 ring-foreground/15">
          <CardHeader className="gap-3 border-b border-foreground/15 px-6 py-6 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="bg-foreground px-2 py-1 text-xs font-bold tracking-[0.14em] text-background uppercase">
                Register
              </span>
              <span className="h-px flex-1 bg-foreground/15" aria-hidden="true" />
            </div>
            <CardTitle className="font-heading text-2xl tracking-[-0.03em]">
              Create your account
            </CardTitle>
            <CardDescription>
              Use your approved RMIT email so you can enter the forum right
              away.
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
            <form className="space-y-6" onSubmit={handleSubmit} noValidate>
              {submitError && (
                <Alert variant="destructive" className="rounded-none">
                  <CircleAlert aria-hidden="true" />
                  <AlertTitle>{serverErrorTitle()}</AlertTitle>
                  <AlertDescription>{submitError.message}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label
                  className="text-xs font-semibold tracking-[0.08em] text-foreground uppercase"
                  htmlFor="displayName"
                >
                  Display name
                </Label>
                <Input
                  id="displayName"
                  name="displayName"
                  type="text"
                  autoComplete="name"
                  placeholder="How others will see you"
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    clearFieldError("displayName");
                  }}
                  aria-invalid={fieldErrors.displayName !== undefined}
                  aria-describedby={
                    fieldErrors.displayName ? "displayName-error" : undefined
                  }
                  className="h-12 rounded-none bg-background px-4 text-base"
                />
                {fieldErrors.displayName && (
                  <p
                    id="displayName-error"
                    className="flex items-start gap-1.5 text-sm text-destructive"
                  >
                    <FieldErrorIcon />
                    {fieldErrors.displayName}
                  </p>
                )}
              </div>

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
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clearFieldError("email");
                  }}
                  aria-invalid={fieldErrors.email !== undefined}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  className="h-12 rounded-none bg-background px-4 text-base"
                />
                {fieldErrors.email && (
                  <p
                    id="email-error"
                    className="flex items-start gap-1.5 text-sm text-destructive"
                  >
                    <FieldErrorIcon />
                    {fieldErrors.email}
                  </p>
                )}
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
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearFieldError("password");
                    if (confirmPassword.length > 0) clearFieldError("confirmPassword");
                  }}
                  aria-invalid={fieldErrors.password !== undefined}
                  aria-describedby={
                    fieldErrors.password ? "password-error" : undefined
                  }
                  className="h-12 rounded-none bg-background px-4 text-base"
                />
                {fieldErrors.password && (
                  <p
                    id="password-error"
                    className="flex items-start gap-1.5 text-sm text-destructive"
                  >
                    <FieldErrorIcon />
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  className="text-xs font-semibold tracking-[0.08em] text-foreground uppercase"
                  htmlFor="confirmPassword"
                >
                  Confirm password
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    clearFieldError("confirmPassword");
                  }}
                  aria-invalid={fieldErrors.confirmPassword !== undefined}
                  aria-describedby={
                    fieldErrors.confirmPassword
                      ? "confirmPassword-error"
                      : undefined
                  }
                  className="h-12 rounded-none bg-background px-4 text-base"
                />
                {fieldErrors.confirmPassword && (
                  <p
                    id="confirmPassword-error"
                    className="flex items-start gap-1.5 text-sm text-destructive"
                  >
                    <FieldErrorIcon />
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                className="h-12 w-full rounded-none px-4 text-base shadow-none"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                    Creating your account…
                  </>
                ) : (
                  <>
                    Create your account
                    <ArrowUpRight aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex-col items-stretch gap-3 rounded-none border-t border-foreground/15 bg-muted/40 px-6 py-4 text-xs leading-5 text-muted-foreground sm:px-8">
            <div className="flex items-center gap-2">
              <KeyRound size={15} aria-hidden="true" />
              <span>Your account logs you in with a secure browser cookie.</span>
            </div>
            <p className="flex items-center gap-1.5">
              <span>Already a member?</span>
              <Link
                to="/sign-in"
                className="inline-flex items-center gap-1 font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                Sign in
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </p>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
