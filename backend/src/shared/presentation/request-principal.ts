export interface RequestPrincipal {
  readonly userId: string;
  readonly platformRole: "student" | "system_admin";
}
