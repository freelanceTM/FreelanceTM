import { Switch, Route, Router as WouterRouter } from "wouter";
  import {
    QueryClient,
    QueryClientProvider,
    QueryCache,
    MutationCache,
  } from "@tanstack/react-query";
  import { Toaster } from "@/components/ui/toaster";
  import { TooltipProvider } from "@/components/ui/tooltip";
  import { AuthProvider } from "@/contexts/AuthContext";
  import { ProtectedRoute } from "@/components/ProtectedRoute";
  import { ApiError } from "@workspace/api-client-react";
  import NotFound from "@/pages/not-found";

  import Landing from "@/pages/Landing";
  import Catalog from "@/pages/Catalog";
  import Tenders from "@/pages/Tenders";
  import TenderDetail from "@/pages/TenderDetail";
  import Orders from "@/pages/Orders";
  import Profile from "@/pages/Profile";
  import Login from "@/pages/Login";
  import Register from "@/pages/Register";
  import GigDetail from "@/pages/GigDetail";
  import TenderNew from "@/pages/TenderNew";

  function dispatch401() {
    window.dispatchEvent(new CustomEvent("ftm:unauthorized"));
  }

  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof ApiError && error.status === 401) dispatch401();
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (error instanceof ApiError && error.status === 401) dispatch401();
      },
    }),
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });

  function Router() {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/gigs/:id" component={GigDetail} />
        <Route path="/catalog" component={Catalog} />
        <Route path="/tenders" component={Tenders} />
        <Route path="/tenders/new">
          <ProtectedRoute>
            <TenderNew />
          </ProtectedRoute>
        </Route>
        <Route path="/tenders/:id" component={TenderDetail} />
        <Route path="/orders">
          <ProtectedRoute>
            <Orders />
          </ProtectedRoute>
        </Route>
        <Route path="/profile">
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        </Route>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  function App() {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  export default App;
  