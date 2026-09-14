export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="space-y-2">
        <div className="h-10 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-10 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-10 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-10 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
