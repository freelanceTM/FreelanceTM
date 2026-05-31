import { ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { 
  Menu, 
  Search,
  Briefcase,
  FileText,
  User,
  Wallet,
  LogOut,
  LayoutDashboard,
  Plus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const role = user?.role ?? "";
  const isBuyer = isAuthenticated && role === "buyer";
  const isFreelancer = isAuthenticated && (role === "freelancer" || role === "both");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1 rounded-md">
              <Briefcase className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">FreelanceTM</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="/catalog" className="hover:text-foreground transition-colors">Catalog</Link>
            <Link href="/tenders" className="hover:text-foreground transition-colors">Exchange</Link>
            {isAuthenticated && (
              <Link href="/orders" className="hover:text-foreground transition-colors">My Orders</Link>
            )}
            {isFreelancer && (
              <Link
                href="/tenders/my-bids"
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                My Proposals
              </Link>
            )}
            {isBuyer && (
              <Link
                href="/tenders/new"
                className="flex items-center gap-1 text-accent hover:text-accent/80 font-semibold transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Post Request
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search gigs..."
              className="h-9 w-64 rounded-md border border-input bg-transparent px-8 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full" data-testid="button-user-menu">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.avatarUrl || undefined} alt={user?.username} />
                    <AvatarFallback>{user?.username?.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    <p className="font-medium">{user?.displayName || user?.username}</p>
                    <p className="w-[200px] truncate text-sm text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="w-full flex items-center cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/orders" className="w-full flex items-center cursor-pointer">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    <span>Orders</span>
                  </Link>
                </DropdownMenuItem>
                {isFreelancer && (
                  <DropdownMenuItem asChild>
                    <Link href="/tenders/my-bids" className="w-full flex items-center cursor-pointer">
                      <FileText className="mr-2 h-4 w-4" />
                      <span>My Proposals</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="w-full flex items-center cursor-pointer">
                    <Wallet className="mr-2 h-4 w-4" />
                    <span>Wallet</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive cursor-pointer" data-testid="button-logout">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Button variant="ghost" asChild data-testid="link-login">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild data-testid="link-register">
                <Link href="/register">Sign up</Link>
              </Button>
            </div>
          )}

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="flex flex-col gap-6 py-4">
                <Link href="/" className="flex items-center gap-2">
                  <div className="bg-primary text-primary-foreground p-1 rounded-md">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <span className="text-xl font-bold">FreelanceTM</span>
                </Link>
                <nav className="flex flex-col gap-4 text-sm font-medium">
                  <Link href="/catalog" className="hover:text-primary transition-colors">Catalog</Link>
                  <Link href="/tenders" className="hover:text-primary transition-colors">Exchange</Link>
                  {isAuthenticated ? (
                    <>
                      <Link href="/orders" className="hover:text-primary transition-colors">My Orders</Link>
                      {isFreelancer && (
                        <Link href="/tenders/my-bids" className="flex items-center gap-1 hover:text-primary transition-colors">
                          <FileText className="h-3.5 w-3.5" /> My Proposals
                        </Link>
                      )}
                      <Link href="/profile" className="hover:text-primary transition-colors">Profile & Wallet</Link>
                      {isBuyer && (
                        <Link href="/tenders/new" className="text-accent font-semibold hover:text-accent/80 transition-colors flex items-center gap-1">
                          <Plus className="h-3.5 w-3.5" /> Post Request
                        </Link>
                      )}
                      <button onClick={logout} className="text-left text-destructive hover:text-destructive transition-colors">
                        Log out
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/login" className="hover:text-primary transition-colors">Log in</Link>
                      <Link href="/register" className="hover:text-primary transition-colors">Sign up</Link>
                    </>
                  )}
                </nav>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
