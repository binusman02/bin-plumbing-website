import { getStatusMeta } from "@/lib/status-styles";

interface BadgeProps {
  status?: string | null;
  label?: string;
  className?: string;
}

export function Badge({ status, label, className = "" }: BadgeProps) {
  const meta = getStatusMeta(status);
  return <span className={`${meta.className} ${className}`}>{label || meta.label}</span>;
}
