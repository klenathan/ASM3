import { Markdown } from "@tanstack/markdown/react"

import { cn } from "../../lib/utils"

export function MarkdownContent({
  children,
  compact = false,
}: {
  readonly children: string
  readonly compact?: boolean
}) {
  return (
    <div
      className={cn(
        "thread-markdown max-w-[72ch] text-[0.97rem] leading-7 text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:my-4 [&_blockquote]:border-l [&_blockquote]:border-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_h1]:mt-7 [&_h1]:mb-3 [&_h1]:font-heading [&_h1]:text-3xl [&_h1]:leading-none [&_h1]:uppercase [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:font-heading [&_h2]:text-2xl [&_h2]:leading-none [&_h2]:uppercase [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-foreground/20 [&_pre]:bg-muted [&_pre]:p-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6",
        compact && "text-sm leading-6 [&_blockquote]:my-3 [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-base [&_p]:my-3 [&_pre]:my-4",
      )}
    >
      <Markdown>{children}</Markdown>
    </div>
  )
}
