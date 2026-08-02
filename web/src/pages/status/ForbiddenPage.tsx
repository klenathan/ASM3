import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../features/auth/auth-context";
import { StatusPage } from "./StatusPage";

export function ForbiddenPage({ detail }: { detail?: string }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  async function handleReturn() {
    try {
      await signOut();
    } finally {
      navigate("/", { replace: true });
    }
  }

  return (
    <StatusPage
      icon={<ShieldAlert size={24} strokeWidth={1.5} aria-hidden="true" />}
      code="403 / Access denied"
      title="This space is not open to this account."
      detail={
        detail ??
        "Your account may be suspended, deactivated, or missing the role needed for this route."
      }
      action="Sign out and return to landing"
      onAction={() => void handleReturn()}
    />
  );
}
