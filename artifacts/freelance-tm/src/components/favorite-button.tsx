import { Heart } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useListFavorites, useAddFavorite, useRemoveFavorite, getListFavoritesQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface FavoriteButtonProps {
  gigId: number;
  className?: string;
}

export function FavoriteButton({ gigId, className }: FavoriteButtonProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: favorites } = useListFavorites({
    query: { enabled: !!user, queryKey: getListFavoritesQueryKey() }
  });

  const addFav = useAddFavorite();
  const removeFav = useRemoveFavorite();

  const isFavorited = favorites?.includes(gigId);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      setLocation("/login");
      return;
    }
    if (isFavorited) {
      removeFav.mutate({ gigId });
    } else {
      addFav.mutate({ data: { gigId } });
    }
  };

  return (
    <button
      onClick={handleToggle}
      className={cn(
        "p-2 rounded-full transition-all",
        isFavorited
          ? "text-red-500 bg-red-500/10 hover:bg-red-500/20"
          : "text-muted-foreground bg-white/5 hover:bg-white/10 hover:text-red-400",
        className
      )}
    >
      <Heart className={cn("w-4 h-4", isFavorited && "fill-current")} />
    </button>
  );
}
