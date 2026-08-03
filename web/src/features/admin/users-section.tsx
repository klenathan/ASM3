import { useEffect, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Ban, MoreHorizontal, Settings2, UserX } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";

import { useAuth } from "../auth/auth-context";
import {
  deactivateUser,
  fetchAdminUsers,
  setUserRole,
  suspendUser,
  type AdminUser,
  type PlatformRole,
  type UserStatus,
} from "./users-api";

const PAGE_LIMIT = 50;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function statusBadge(status: AdminUser["status"]) {
  switch (status) {
    case "active":
      return <Badge variant="secondary">Active</Badge>;
    case "suspended":
      return <Badge variant="outline" className="text-destructive">Suspended</Badge>;
    case "deactivated":
      return <Badge variant="outline" className="opacity-60">Deactivated</Badge>;
  }
}

function roleBadge(role: AdminUser["platformRole"]) {
  return role === "system_admin" ? (
    <Badge variant="default">System admin</Badge>
  ) : (
    <Badge variant="outline">Member</Badge>
  );
}

const ROLE_LABELS: Record<PlatformRole, string> = {
  student: "Member",
  system_admin: "System admin",
};

function SetRoleDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<PlatformRole>(user.platformRole);

  useEffect(() => {
    if (open) setRole(user.platformRole);
  }, [open, user.platformRole]);

  const mutation = useMutation({
    mutationFn: (next: PlatformRole) => setUserRole(user.userId, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success(`${user.displayName} is now ${ROLE_LABELS[role]}.`);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disabled = role === user.platformRole || mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set platform role</DialogTitle>
          <DialogDescription>
            Change {user.displayName}’s role on the platform.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={`role-select-${user.userId}`}>Role</Label>
          <Select value={role} onValueChange={(value) => setRole(value as PlatformRole)}>
            <SelectTrigger id={`role-select-${user.userId}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="student">Member</SelectItem>
              <SelectItem value="system_admin">System admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={disabled} onClick={() => mutation.mutate(role)}>
            Save role
          </Button>
        </DialogFooter>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error?.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SuspendDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [until, setUntil] = useState("");

  useEffect(() => {
    if (open) setUntil("");
  }, [open]);

  const mutation = useMutation({
    mutationFn: (value: string) =>
      suspendUser(user.userId, value === "" ? null : new Date(value).toISOString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success(`${user.displayName} suspended.`);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = () => {
    if (until !== "" && Number.isNaN(new Date(until).getTime())) {
      toast.error("Enter a valid suspension end time, or leave it blank.");
      return;
    }
    mutation.mutate(until);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend {user.displayName}</DialogTitle>
          <DialogDescription>
            They can’t sign in while suspended. Leave the time blank for an indefinite
            suspension.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={`suspend-until-${user.userId}`}>Suspended until (optional)</Label>
          <Input
            id={`suspend-until-${user.userId}`}
            type="datetime-local"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={submit}
          >
            Suspend
          </Button>
        </DialogFooter>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error?.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeactivateAlert({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deactivateUser(user.userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success(`${user.displayName} deactivated.`);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate {user.displayName}</AlertDialogTitle>
          <AlertDialogDescription>
            They lose access to the platform until an admin re-activates them. This can’t be
            undone from this screen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            Deactivate
          </AlertDialogAction>
        </AlertDialogFooter>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error?.message}
          </p>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RowActions({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const [roleOpen, setRoleOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  if (isSelf) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.displayName}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRoleOpen(true)}>
            <Settings2 className="size-4" />
            Set role
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSuspendOpen(true)}>
            <Ban className="size-4" />
            Suspend
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeactivateOpen(true)}>
            <UserX className="size-4" />
            Deactivate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SetRoleDialog user={user} open={roleOpen} onOpenChange={setRoleOpen} />
      <SuspendDialog user={user} open={suspendOpen} onOpenChange={setSuspendOpen} />
      <DeactivateAlert user={user} open={deactivateOpen} onOpenChange={setDeactivateOpen} />
    </>
  );
}

function UsersTable({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: string | undefined;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.userId}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium text-foreground">{user.displayName}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </TableCell>
            <TableCell>{roleBadge(user.platformRole)}</TableCell>
            <TableCell>{statusBadge(user.status)}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(user.createdAt)}
            </TableCell>
            <TableCell className="text-right">
              <RowActions user={user} isSelf={user.userId === currentUserId} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function UsersSection() {
  const { user: currentUser } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const search = useDebouncedValue(searchInput, 300);

  const query = useInfiniteQuery({
    queryKey: ["admin", "users", search, status],
    queryFn: ({ pageParam }) =>
      fetchAdminUsers({ search, status, cursor: pageParam, limit: PAGE_LIMIT }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const users = query.data?.pages.flatMap((page) => page.items) ?? [];
  const canLoadMore = query.hasNextPage;

  return (
    <section aria-labelledby="users-heading">
      <h2
        id="users-heading"
        className="font-heading text-2xl font-semibold tracking-[0.01em] text-balance uppercase"
      >
        Users &amp; roles
      </h2>
      <p className="mt-2 max-w-lg leading-7 text-muted-foreground">
        Manage accounts, status, and platform roles.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder="Search by email or name"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="max-w-xs"
          aria-label="Search users"
        />
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as UserStatus | "")}
        >
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="deactivated">Deactivated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 overflow-hidden">
        {query.isPending && (
          <div className="space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-4 py-3">
                <Skeleton className="h-9" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="size-7 rounded-md" />
              </div>
            ))}
          </div>
        )}

        {query.isError && (
          <div className="flex flex-col items-start gap-3 border border-dashed border-foreground/25 px-5 py-8">
            <p role="alert" className="text-sm text-destructive">
              {query.error?.message}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              Retry
            </Button>
          </div>
        )}

        {query.isSuccess && users.length === 0 && (
          <p className="py-8 leading-7 text-muted-foreground">No users match that filter.</p>
        )}

        {query.isSuccess && users.length > 0 && (
          <UsersTable users={users} currentUserId={currentUser?.userId} />
        )}
      </div>

      {canLoadMore && (
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </section>
  );
}
