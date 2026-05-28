import { useI18n } from "@/lib/i18n";

type OrderStatus = "pending" | "active" | "delivered" | "completed" | "cancelled" | "disputed";

const statusColors: Record<OrderStatus, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  active: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  delivered: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  disputed: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useI18n();
  const s = status as OrderStatus;
  const label = t.status[s] ?? status.toUpperCase();
  const color = statusColors[s] ?? "bg-white/10 text-muted-foreground border-white/10";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {label}
    </span>
  );
}
