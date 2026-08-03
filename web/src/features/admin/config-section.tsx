import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Skeleton } from "../../components/ui/skeleton";
import { Textarea } from "../../components/ui/textarea";

import { fetchPlatformConfig, updatePlatformConfig, type ConfigItem } from "./config-api";

const CONFIG_META: Record<string, { label: string; description: string }> = {
  allowed_email_domains: {
    label: "Allowed email domains",
    description:
      "Comma-separated RMIT email domains accepted at registration.",
  },
};

function metaFor(key: string): { label: string; description: string } {
  return (
    CONFIG_META[key] ?? {
      label: key,
      description: "Platform configuration value.",
    }
  );
}

function ConfigRow({ item }: { item: ConfigItem }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(item.value);
  const meta = metaFor(item.key);

  const mutation = useMutation({
    mutationFn: (next: string) => updatePlatformConfig(item.key, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "config"] });
      toast.success(`${meta.label} updated.`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const dirty = value !== item.value;

  return (
    <div className="flex flex-col gap-3 border-b border-foreground/15 py-5 last:border-b-0">
      <div>
        <h3 className="font-heading text-sm font-semibold tracking-[0.02em] text-foreground uppercase">
          {meta.label}
        </h3>
        <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
          {meta.description}
        </p>
      </div>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty) mutation.mutate(value);
        }}
      >
        <div className="min-w-0 flex-1">
          <Label htmlFor={`config-${item.key}`} className="sr-only">
            {meta.label}
          </Label>
          <Textarea
            id={`config-${item.key}`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            rows={2}
            className="max-w-lg font-mono text-xs"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={!dirty || mutation.isPending}
        >
          Save
        </Button>
      </form>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error?.message}
        </p>
      )}
    </div>
  );
}

export function ConfigSection() {
  const query = useQuery({
    queryKey: ["admin", "config"],
    queryFn: fetchPlatformConfig,
  });

  return (
    <section aria-labelledby="config-heading">
      <h2
        id="config-heading"
        className="font-heading text-2xl font-semibold tracking-[0.01em] text-balance uppercase"
      >
        Platform config
      </h2>
      <p className="mt-2 max-w-lg leading-7 text-muted-foreground">
        Manage registration policy and platform keys.
      </p>

      <div className="mt-6">
        {query.isPending && (
          <div className="space-y-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-3 border-b border-foreground/15 py-5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-16 w-full max-w-lg" />
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

        {query.isSuccess && (
          <div className="divide-y divide-foreground/15">
            {query.data.items.length === 0 ? (
              <p className="py-8 leading-7 text-muted-foreground">No platform keys configured.</p>
            ) : (
              query.data.items.map((item) => <ConfigRow key={item.key} item={item} />)
            )}
          </div>
        )}
      </div>
    </section>
  );
}
