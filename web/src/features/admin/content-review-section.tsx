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
      </p>

      <div className="mt-6">
        <ReviewQueue scope="admin" />
      </div>
    </section>
  );
}
