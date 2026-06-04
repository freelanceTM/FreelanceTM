import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

const STORAGE_KEY = "ftm_cookie_consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          className="fixed bottom-20 md:bottom-6 inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
        >
          <div className="pointer-events-auto w-full max-w-xl flex items-start md:items-center gap-4 bg-card/95 backdrop-blur-md border border-white/10 rounded-2xl px-5 py-4 shadow-2xl">
            <Cookie className="w-5 h-5 text-primary shrink-0 mt-0.5 md:mt-0" />
            <p className="flex-1 text-sm text-muted-foreground leading-relaxed">
              Мы используем файлы cookie для повышения удобства работы с платформой.
              Оставаясь на сайте, вы соглашаетесь с нашей{" "}
              <Link href="/privacy" className="text-primary hover:underline font-medium">
                Политикой конфиденциальности
              </Link>.
            </p>
            <Button size="sm" className="shrink-0 h-8 px-4 text-xs" onClick={accept}>
              Принять
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
