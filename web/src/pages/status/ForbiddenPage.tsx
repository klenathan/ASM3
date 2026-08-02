import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { StatusPage } from "./StatusPage";

export function ForbiddenPage({ detail }: { detail?: string }) {
  const navigate = useNavigate();

  return (
    <StatusPage
      icon={<ShieldAlert size={24} strokeWidth={1.5} aria-hidden="true" />}
      code="403 / ACCESS DENIED"
      title="This space is not open to this account."
      detail={
        detail ??
        "Your account may be suspended, deactivated, or missing the role needed for this route."
      }
      action="Return to forum"
      onAction={() => navigate("/")}
      secondary="Return to landing"
      onSecondary={() => navigate("/")}
    />
  );
}
