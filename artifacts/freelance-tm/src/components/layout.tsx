import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { LangSwitcher } from "@/components/lang-switcher";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, LogIn, LogOut, Plus, Search, Heart, Menu, X, Home, BookOpen, User, ClipboardList } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";

export function Layout({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, logout } = useAuth();
  const { t } = useI18n();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const bottomNavItems = [
    { href: "/", icon: Home, label: "Главная" },
    { href: "/gigs", icon: Search, label: "Каталог" },
    { href: "/orders", icon: ClipboardList, label: "Заказы" },
    { href: isAuthenticated && user ? `/profile/${user.id}` : "/login", icon: User, label: "Профиль" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto h-14 md:h-16 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 md:w-8 md:h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-display font-bold text-lg md:text-xl">
                F
              </div>
              <span className="font-display font-bold text-lg md:text-xl tracking-tight">FreelanceTM</span>
            </Link>
            <nav className="hidden md:flex gap-5">
              <Link
                href="/gigs"
                className={`text-sm font-medium transition-colors hover:text-primary ${location === "/gigs" ? "text-primary" : "text-muted-foreground"}`}
              >
                {t.nav.explore}
              </Link>
              <Link
                href="/how-it-works"
                className={`text-sm font-medium transition-colors hover:text-primary ${location === "/how-it-works" ? "text-primary" : "text-muted-foreground"}`}
              >
                {t.nav.howItWorks}
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <LangSwitcher />

            {/* Desktop auth buttons */}
            {isAuthenticated ? (
              <div className="hidden md:flex items-center gap-2">
                {user?.role !== "client" && (
                  <Link href="/create-gig">
                    <Button variant="outline" size="sm" className="gap-2 bg-white/5 border-white/10 hover:bg-white/10">
                      <Plus className="w-4 h-4" />
                      {t.nav.postGig}
                    </Button>
                  </Link>
                )}
                <Link href="/favorites">
                  <Button variant="ghost" size="icon" title="Избранное" className="text-muted-foreground hover:text-red-400">
                    <Heart className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/orders">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <ClipboardList className="w-4 h-4" />
                    <span>My Orders</span>
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>{t.nav.dashboard}</span>
                  </Button>
                </Link>
                <Link href={`/profile/${user?.id}`}>
                  <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center text-sm font-bold cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs">{(user?.displayName || user?.username || "U").substring(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                </Link>
                <Button variant="ghost" size="icon" onClick={logout} title={t.nav.logout} className="text-muted-foreground hover:text-destructive">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" className="text-sm font-medium">{t.nav.login}</Button>
                </Link>
                <Link href="/login">
                  <Button className="text-sm font-medium gap-2">
                    <LogIn className="w-4 h-4" />
                    {t.nav.signup}
                  </Button>
                </Link>
              </div>
            )}

            {/* Mobile: search shortcut + hamburger */}
            <Link href="/gigs" className="md:hidden">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Search className="w-4 h-4" />
              </Button>
            </Link>
            <button
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-md hover:bg-white/10 transition-colors"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Меню"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-background/95 backdrop-blur-md px-4 py-4 space-y-1">
            <Link href="/gigs">
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${location === "/gigs" ? "bg-primary/10 text-primary" : "hover:bg-white/5 text-muted-foreground"}`}>
                <Search className="w-4 h-4" />
                {t.nav.explore}
              </div>
            </Link>
            <Link href="/how-it-works">
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${location === "/how-it-works" ? "bg-primary/10 text-primary" : "hover:bg-white/5 text-muted-foreground"}`}>
                <BookOpen className="w-4 h-4" />
                {t.nav.howItWorks}
              </div>
            </Link>

            <div className="pt-2 border-t border-white/10 mt-2">
              {isAuthenticated ? (
                <div className="space-y-1">
                  {user?.role !== "client" && (
                    <Link href="/create-gig">
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5 text-muted-foreground transition-colors">
                        <Plus className="w-4 h-4" />
                        {t.nav.postGig}
                      </div>
                    </Link>
                  )}
                  <Link href="/orders">
                    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${location === "/orders" ? "bg-primary/10 text-primary" : "hover:bg-white/5 text-muted-foreground"}`}>
                      <ClipboardList className="w-4 h-4" />
                      My Orders
                    </div>
                  </Link>
                  <Link href="/favorites">
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5 text-muted-foreground transition-colors">
                      <Heart className="w-4 h-4" />
                      Избранное
                    </div>
                  </Link>
                  <Link href={`/profile/${user?.id}`}>
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5 text-muted-foreground transition-colors">
                      <User className="w-4 h-4" />
                      {user?.displayName || user?.username}
                    </div>
                  </Link>
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5 text-destructive transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    {t.nav.logout}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Link href="/login">
                    <Button variant="outline" className="w-full border-white/10">{t.nav.login}</Button>
                  </Link>
                  <Link href="/login">
                    <Button className="w-full gap-2">
                      <LogIn className="w-4 h-4" />
                      {t.nav.signup}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Page content — add bottom padding on mobile for the bottom nav */}
      <main className="flex-1 pb-16 md:pb-0">{children}</main>

      <footer className="hidden md:block border-t border-white/10 bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 md:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-display font-bold">
                F
              </div>
              <span className="font-display font-bold text-lg">FreelanceTM</span>
            </Link>
            <p className="text-sm text-muted-foreground mb-4">
              Первая цифровая платформа для фрилансеров Туркменистана. Безопасно, быстро, профессионально.
            </p>
            <LangSwitcher />
          </div>
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Для клиентов</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/gigs" className="hover:text-primary transition-colors">Найти специалиста</Link></li>
              <li><Link href="/how-it-works" className="hover:text-primary transition-colors">Как заказать</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Для фрилансеров</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/create-gig" className="hover:text-primary transition-colors">Разместить услугу</Link></li>
              <li><Link href="/onboarding" className="hover:text-primary transition-colors">Заполнить профиль</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Контакты</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">Telegram-канал</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Служба поддержки</a></li>
            </ul>
          </div>
        </div>
        <div className="container mx-auto px-4 md:px-8 mt-12 pt-8 border-t border-white/5 text-sm text-muted-foreground flex flex-col md:flex-row justify-between items-center">
          <p>© 2026 FreelanceTM. Все права защищены.</p>
          <div className="flex gap-4 mt-4 md:mt-0">
            <a href="#" className="hover:text-foreground transition-colors">Правила</a>
            <a href="#" className="hover:text-foreground transition-colors">Конфиденциальность</a>
          </div>
        </div>
      </footer>

      {/* Mobile footer (mini) */}
      <div className="md:hidden border-t border-white/5 bg-background py-6 px-4 text-center text-xs text-muted-foreground">
        © 2026 FreelanceTM
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/90 backdrop-blur-md border-t border-white/10">
        <div className="flex items-center justify-around h-16">
          {bottomNavItems.map(({ href, icon: Icon, label }) => {
            const active = location === href || (href === "/gigs" && location.startsWith("/gigs"));
            return (
              <Link key={href} href={href}>
                <div className={`flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
