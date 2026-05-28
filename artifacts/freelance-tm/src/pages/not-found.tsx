import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Home, Search } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <Layout>
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-lg"
        >
          <div className="text-[120px] md:text-[160px] font-display font-bold leading-none text-transparent bg-clip-text bg-gradient-to-b from-white/10 to-white/5 select-none mb-4">
            404
          </div>
          <h1 className="text-3xl font-display font-bold mb-3">Страница не найдена</h1>
          <p className="text-muted-foreground mb-8">
            Такой страницы не существует. Возможно, ссылка устарела или была удалена.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/">
              <Button className="gap-2">
                <Home className="w-4 h-4" />
                На главную
              </Button>
            </Link>
            <Link href="/gigs">
              <Button variant="outline" className="gap-2 border-white/10 bg-white/5">
                <Search className="w-4 h-4" />
                Найти услугу
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
