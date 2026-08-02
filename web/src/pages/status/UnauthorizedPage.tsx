import { KeyRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { StatusPage } from "./StatusPage";

export function UnauthorizedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    typeof location.state?.from === "string" ? location.state.from : "/";

  return (
    <StatusPage
      icon={<KeyRound size={24} strokeWidth={1.5} aria-hidden="true" />}
      code="401 / Session required"
      title="This page needs an account."
      detail="Your session is missing or has expired. Sign in with your approved RMIT identity to continue where you left off."
      action="Sign in"
      onAction={() => navigate("/sign-in", { state: { from } })}
      secondary="Return to landing"
      onSecondary={() => navigate("/")}
    />
  );
}
