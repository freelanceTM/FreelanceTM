import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console for debugging — in production swap for a logging service
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card border border-white/10 rounded-2xl p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-display font-bold">Ой, что-то пошло не так</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Мы уже чиним! Попробуйте обновить страницу — это обычно помогает.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-left">
                <p className="text-xs font-mono text-muted-foreground break-all line-clamp-3">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1 gap-2 border border-white/10"
                onClick={this.handleReset}
              >
                Попробовать снова
              </Button>
              <Button className="flex-1 gap-2" onClick={this.handleReload}>
                <RefreshCw className="w-4 h-4" />
                Перезагрузить
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
