import { BadgeCheck, TrendingUp, Crown, Zap, Clock, ShoppingBag } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Level = "new" | "rising" | "top" | "pro";

const levelConfig: Record<Level, { icon: React.FC<{ className?: string }>, color: string, bgColor: string }> = {
  new: { icon: Zap, color: "text-zinc-400", bgColor: "bg-zinc-400/10" },
  rising: { icon: TrendingUp, color: "text-emerald-400", bgColor: "bg-emerald-400/10" },
  top: { icon: Crown, color: "text-amber-400", bgColor: "bg-amber-400/10" },
  pro: { icon: Crown, color: "text-primary", bgColor: "bg-primary/10" },
};

interface TrustBadgeProps {
  isVerified?: boolean | null;
  level?: Level | null;
  responseTime?: number | null;
  completedOrders?: number;
  size?: "sm" | "md";
  showAll?: boolean;
}

export function TrustBadge({ isVerified, level, responseTime, completedOrders, size = "md", showAll = false }: TrustBadgeProps) {
  const { t } = useI18n();
  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const textSize = size === "sm" ? "text-xs" : "text-sm";
  const padding = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isVerified && (
        <span className={`inline-flex items-center gap-1 ${padding} rounded-full bg-primary/10 border border-primary/20 ${textSize} font-medium text-primary`}>
          <BadgeCheck className={iconSize} />
          {t.trust.verified}
        </span>
      )}

      {level && level !== "new" && (
        <span className={`inline-flex items-center gap-1 ${padding} rounded-full ${levelConfig[level].bgColor} border border-white/10 ${textSize} font-medium ${levelConfig[level].color}`}>
          {(() => { const Icon = levelConfig[level].icon; return <Icon className={iconSize} />; })()}
          {t.profile.level[level]}
        </span>
      )}

      {showAll && responseTime != null && responseTime > 0 && (
        <span className={`inline-flex items-center gap-1 ${padding} rounded-full bg-white/5 border border-white/10 ${textSize} text-muted-foreground`}>
          <Clock className={iconSize} />
          {t.trust.responseTime} {responseTime}{t.trust.hours}
        </span>
      )}

      {showAll && completedOrders != null && completedOrders > 0 && (
        <span className={`inline-flex items-center gap-1 ${padding} rounded-full bg-white/5 border border-white/10 ${textSize} text-muted-foreground`}>
          <ShoppingBag className={iconSize} />
          {completedOrders} {t.trust.completedOrders}
        </span>
      )}
    </div>
  );
}
