import "@workspace/api-client-react";

declare module "@workspace/api-client-react" {
  interface User {
    walletAddress?: string | null;
    balanceNano?: string | null;
    notificationsEnabled?: boolean;
  }
}
