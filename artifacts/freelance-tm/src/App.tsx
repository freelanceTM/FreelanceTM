import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { getErrorToast } from "@/lib/api-error";
import { ApiError } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { AIChatWidget } from "@/components/ai-chat-widget";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Login from "@/pages/login";
import VerifyEmail from "@/pages/verify-email";
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
import TermsPage from "@/pages/legal/terms";
import EscrowPage from "@/pages/legal/escrow";
import PrivacyPage from "@/pages/legal/privacy";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status < 500) return;
      const qt = getErrorToast(error);
      toast({ title: qt.title, description: qt.description, variant: "destructive" });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      const mt = getErrorToast(error);
      toast({ title: mt.title, description: mt.description, variant: "destructive" });
    },
  }),
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
      <Route path="/verify-email" component={VerifyEmail} />
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
      <Route path="/terms" component={TermsPage} />
      <Route path="/escrow" component={EscrowPage} />
      <Route path="/privacy" component={PrivacyPage} />
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
