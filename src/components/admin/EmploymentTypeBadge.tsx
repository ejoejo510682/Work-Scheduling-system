import type { EmploymentType } from "@/lib/constants";

const styles: Record<EmploymentType, string> = {
  PT: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  正職: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
};

export function EmploymentTypeBadge({ type }: { type: EmploymentType }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${styles[type]}`}>
      {type}
    </span>
  );
}
