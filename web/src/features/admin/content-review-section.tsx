import { ReviewQueue } from "../analysis/review-queue";

export function ContentReviewSection() {
  return (
    <section aria-labelledby="content-review-heading">
      <h2
        id="content-review-heading"
        className="font-heading text-2xl font-semibold tracking-[0.01em] text-balance uppercase"
      >
        Content review
      </h2>
      <p className="mt-2 max-w-lg leading-7 text-muted-foreground">
        Threads across all societies whose automated content check returned{" "}
        <span className="font-medium text-foreground">none</span> or{" "}
        <span className="font-medium text-foreground">needs review</span>.
        Override the automated decision to{" "}
        <span className="font-medium text-foreground">accept</span> (publish) or{" "}
        <span className="font-medium text-foreground">reject</span> (hide) a
        post, or re-run the automated analysis.
      </p>

      <div className="mt-6">
        <ReviewQueue scope="admin" />
      </div>
    </section>
  );
}
