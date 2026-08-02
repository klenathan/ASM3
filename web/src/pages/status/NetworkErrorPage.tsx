import { useState } from "react";
import { Unplug } from "lucide-react";

import { useAuth } from "../../features/auth/auth-context";
import { StatusPage } from "./StatusPage";

export function NetworkErrorPage() {
  const { refresh } = useAuth();
  const [isRetrying, setIsRetrying] = useState(false);

  async function handleRetry() {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await refresh();
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <StatusPage
      icon={<Unplug size={24} strokeWidth={1.5} aria-hidden="true" />}
      code="Offline / Service unreachable"
      title="The reading table is out of reach."
      detail="We could not reach the RMIT Society service. Check your connection, then try again."
      action={isRetrying ? "Trying again…" : "Try again"}
      onAction={() => void handleRetry()}
    />
  );
}
