import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { AIChatWidget } from "@/components/ai-chat-widget";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Login from "@/pages/login";
import Gigs from "@/pages/gigs";
import GigDetail from "@/pages/gig-detail";
import Dashboard from "@/pages/dashboard";
import Profile from "@/pages/profile";
import CreateGig from "@/pages/create-gig";
import OrderDetail from "@/pages/order-detail";
import Orders from "@/pages/orders";
import Onboarding from "@/pages/onboarding";
import Favorites from "@/pages/favorites";
import HowItWorks from "@/pages/how-it-works";
import WalletPage from "@/pages/wallet";
import AdminPage from "@/pages/admin";
import AdminPayments from "@/pages/admin-payments";
import AdminWithdrawals from "@/pages/admin-withdrawals";
import AdminDisputes from "@/pages/admin-disputes";
import AdminUsers from "@/pages/admin-users";
import Tenders from "@/pages/tenders";
import TenderDetail from "@/pages/tender-detail";
import CreateTender from "@/pages/create-tender";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/gigs" component={Gigs} />
      <Route path="/gigs/:id" component={GigDetail} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/profile/:userId" component={Profile} />
      <Route path="/create-gig" component={CreateGig} />
      <Route path="/orders" component={Orders} />
      <Route path="/orders/:id" component={OrderDetail} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/favorites" component={Favorites} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/wallet" component={WalletPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/payments" component={AdminPayments} />
      <Route path="/admin/withdrawals" component={AdminWithdrawals} />
      <Route path="/admin/disputes" component={AdminDisputes} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/tenders" component={Tenders} />
      <Route path="/tenders/:id" component={TenderDetail} />
      <Route path="/create-tender" component={CreateTender} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
            <AIChatWidget />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
