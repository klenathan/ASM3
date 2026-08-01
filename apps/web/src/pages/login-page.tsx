import {
  ArrowRight,
  AtSign,
  CircleAlert,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  LogIn,
  User,
} from "lucide-react";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { STUDY_AREAS } from "@/lib/model";
import { deriveUsername, isValidRmitEmail } from "@/lib/registration";
import { cn } from "@/lib/utils";

interface LocationState {
  from?: string;
}

type FieldErrors = Partial<
  Record<"password" | "displayName" | "major", string>
>;

const PASSWORD_PATTERN =
  "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}";
const PASSWORD_RULE =
  "Use 8+ characters with uppercase, lowercase, number, and symbol.";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signInWithPassword, signUp, confirmSignUp } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [major, setMajor] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "confirm">(
    "sign-in",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  if (user) {
    return <Navigate to="/feed" replace />;
  }

  const from = (location.state as LocationState | null)?.from ?? "/feed";

  const usernamePreview = mode === "sign-up" ? deriveUsername(email) : null;
  const emailValid = mode === "sign-up" ? isValidRmitEmail(email) : true;
  const emailError = mode === "sign-up" && email.trim() !== "" && !emailValid;
  const passwordError = mode === "sign-up" ? fieldErrors.password : undefined;

  const switchMode = (next: "sign-in" | "sign-up" | "confirm") => {
    setMode(next);
    setError(null);
    setFieldErrors({});
    setShowPassword(false);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (mode === "sign-in") {
      if (!email.trim() || !password) return;
    } else if (mode === "confirm") {
      if (!email.trim() || !password || !confirmationCode.trim()) return;
    } else {
      if (!email.trim() || !emailValid) return;
      const errors: FieldErrors = {};
      if (!password || !new RegExp(`^${PASSWORD_PATTERN}$`).test(password)) {
        errors.password = PASSWORD_RULE;
      }
      if (!displayName.trim()) {
        errors.displayName = "Enter the name your schoolmates see.";
      }
      if (!major) {
        errors.major = "Choose your study area.";
      }
      setFieldErrors(errors);
      if (Object.keys(errors).length > 0) return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (mode === "sign-up") {
        await signUp({
          email: email.trim(),
          password,
          display_name: displayName.trim(),
          major,
        });
        setMode("confirm");
        return;
      }
      if (mode === "confirm") {
        await confirmSignUp(email.trim(), password, confirmationCode.trim());
      } else {
        await signInWithPassword(email.trim(), password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : mode === "sign-in"
            ? "Sign-in failed. Check your email and password."
            : mode === "confirm"
              ? "Confirmation failed. Check your code and try again."
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
            <CardTitle className="font-display text-2xl font-black tracking-tight">
              {mode === "sign-in"
                ? "Welcome back"
                : mode === "confirm"
                  ? "Verify your email"
                  : "Join your common room"}
            </CardTitle>
            <CardDescription>
              {mode === "sign-in"
                ? "Sign in with your account to open your common room."
                : mode === "confirm"
                  ? "Enter the confirmation code sent to your RMIT email."
                  : "Sign up with your verified RMIT student email."}
            </CardDescription>
          </CardHeader>

          <form
            onSubmit={submit}
            noValidate={mode === "sign-up"}
            aria-busy={submitting}
          >
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">RMIT student email</Label>
                <InputGroup>
                  <InputGroupAddon align="inline-start" aria-hidden="true">
                    <AtSign className="size-4" />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    disabled={submitting || mode === "confirm"}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={
                      mode === "sign-up"
                        ? "s1234567@student.rmit.edu.au"
                        : "you@example.com"
                    }
                    aria-invalid={emailError}
                    aria-describedby={emailError ? "email-error" : undefined}
                  />
                </InputGroup>
                {emailError && (
                  <p
                    id="email-error"
                    className="flex items-center gap-1.5 text-xs text-destructive"
                  >
                    <CircleAlert className="size-3.5 shrink-0" />
                    Use your RMIT student email, e.g.
                    s1234567@student.rmit.edu.au.
                  </p>
                )}
                {mode === "sign-up" && emailValid && usernamePreview && (
                  <p className="text-xs text-muted-foreground">
                    Your username will be{" "}
                    <span className="font-semibold text-foreground">
                      @{usernamePreview}
                    </span>
                  </p>
                )}
              </div>

              {mode === "sign-up" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="display-name">Name</Label>
                    <InputGroup>
                      <InputGroupAddon align="inline-start" aria-hidden="true">
                        <User className="size-4" />
                      </InputGroupAddon>
                      <InputGroupInput
                        id="display-name"
                        autoComplete="name"
                        required
                        maxLength={60}
                        value={displayName}
                        disabled={submitting}
                        onChange={(event) => {
                          setDisplayName(event.target.value);
                          setFieldErrors((prev) => ({
                            ...prev,
                            displayName: undefined,
                          }));
                        }}
                        placeholder="How your schoolmates see you"
                        aria-invalid={Boolean(fieldErrors.displayName)}
                        aria-describedby={
                          fieldErrors.displayName
                            ? "display-name-error"
                            : undefined
                        }
                      />
                    </InputGroup>
                    {fieldErrors.displayName && (
                      <p
                        id="display-name-error"
                        className="flex items-center gap-1.5 text-xs text-destructive"
                      >
                        <CircleAlert className="size-3.5 shrink-0" />
                        {fieldErrors.displayName}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="major">Study area</Label>
                    <NativeSelect
                      id="major"
                      className="w-full"
                      disabled={submitting}
                      required
                      value={major}
                      onChange={(event) => {
                        setMajor(event.target.value);
                        setFieldErrors((prev) => ({
                          ...prev,
                          major: undefined,
                        }));
                      }}
                      aria-invalid={Boolean(fieldErrors.major)}
                      aria-describedby={
                        fieldErrors.major ? "major-error" : undefined
                      }
                    >
                      <NativeSelectOption value="" disabled>
                        Select your study area…
                      </NativeSelectOption>
                      {STUDY_AREAS.map((area) => (
                        <NativeSelectOption key={area} value={area}>
                          {area}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    {fieldErrors.major && (
                      <p
                        id="major-error"
                        className="flex items-center gap-1.5 text-xs text-destructive"
                      >
                        <CircleAlert className="size-3.5 shrink-0" />
                        {fieldErrors.major}
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <InputGroup aria-invalid={passwordError ? true : undefined}>
                  <InputGroupAddon align="inline-start" aria-hidden="true">
                    <Lock className="size-4" />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      mode === "sign-up" ? "new-password" : "current-password"
                    }
                    minLength={8}
                    pattern={mode === "sign-up" ? PASSWORD_PATTERN : undefined}
                    title={PASSWORD_RULE}
                    required
                    value={password}
                    disabled={submitting}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setFieldErrors((prev) => ({
                        ...prev,
                        password: undefined,
                      }));
                    }}
                    placeholder="Your account password"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby={
                      passwordError
                        ? "password-error"
                        : mode === "sign-up"
                          ? "password-hint"
                          : undefined
                    }
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      disabled={submitting}
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="text-muted-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                {passwordError ? (
                  <p
                    id="password-error"
                    className="flex items-center gap-1.5 text-xs text-destructive"
                  >
                    <CircleAlert className="size-3.5 shrink-0" />
                    {passwordError}
                  </p>
                ) : (
                  <p
                    id="password-hint"
                    className="text-xs text-muted-foreground"
                  >
                    {mode === "sign-up"
                      ? PASSWORD_RULE
                      : "Sign-in is protected by Amazon Cognito."}
                  </p>
                )}
              </div>

              {mode === "confirm" && (
                <div className="space-y-2">
                  <Label htmlFor="confirmation-code">Confirmation code</Label>
                  <InputGroup>
                    <InputGroupAddon align="inline-start" aria-hidden="true">
                      <Lock className="size-4" />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="confirmation-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      minLength={6}
                      maxLength={12}
                      value={confirmationCode}
                      disabled={submitting}
                      onChange={(event) =>
                        setConfirmationCode(event.target.value)
                      }
                      placeholder="6-digit code"
                    />
                  </InputGroup>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Spinner className="size-4" />
                    {mode === "sign-in"
                      ? "Signing in…"
                      : mode === "confirm"
                        ? "Confirming…"
                        : "Creating account…"}
                  </>
                ) : (
                  <>
                    <LogIn className="size-4" />
                    {mode === "sign-in"
                      ? "Sign in"
                      : mode === "confirm"
                        ? "Confirm email"
                        : "Create account"}
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={submitting}
                onClick={() =>
                  switchMode(mode === "sign-in" ? "sign-up" : "sign-in")
                }
              >
                {mode === "sign-in" ? "Create account" : "Use existing account"}
              </Button>
              <p
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
                  submitting && "opacity-70",
                )}
              >
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
