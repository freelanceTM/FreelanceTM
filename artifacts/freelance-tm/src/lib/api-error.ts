import { ApiError, ResponseParseError } from "@workspace/api-client-react";

function extractServerMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.message === "string" && d.message.trim()) return d.message.trim();
  if (Array.isArray(d.message) && d.message.length > 0) return (d.message as string[]).join(". ");
  if (typeof d.error === "string" && d.error.trim()) return d.error.trim();
  if (typeof d.detail === "string" && d.detail.trim()) return d.detail.trim();
  if (typeof d.title === "string" && d.title.trim()) return d.title.trim();
  return null;
}

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("network") ||
      msg.includes("failed to fetch") ||
      msg.includes("load failed") ||
      msg.includes("networkerror") ||
      msg.includes("net::err") ||
      msg.includes("fetch error")
    );
  }
  return false;
}

/**
 * Returns a user-friendly { title, description } pair for display in a toast.
 * Handles ApiError (from customFetch), ResponseParseError, network errors, and generic Error.
 */
export function getErrorToast(err: unknown): { title: string; description?: string } {
  // ── Network / connectivity ──────────────────────────────────────────────
  if (isNetworkError(err)) {
    return {
      title: "Ошибка сети",
      description: "Проверьте соединение или сервер временно недоступен.",
    };
  }

  // ── Response parse error (backend returned non-JSON) ────────────────────
  if (err instanceof ResponseParseError) {
    return {
      title: "Некорректный ответ сервера",
      description: "Сервер вернул неожиданный формат данных. Попробуйте ещё раз.",
    };
  }

  // ── API error (non-2xx HTTP response) ───────────────────────────────────
  if (err instanceof ApiError) {
    const serverMsg = extractServerMessage(err.data);

    // Real server message — already user-facing, show it directly
    if (serverMsg) return { title: serverMsg };

    // Friendly fallback by HTTP status
    if (err.status === 401)
      return { title: "Сессия истекла", description: "Войдите снова — это займёт секунду" };
    if (err.status === 403)
      return { title: "Нет доступа", description: "Ваш аккаунт не имеет прав на это действие" };
    if (err.status === 404)
      return { title: "Не найдено", description: "Объект был удалён или ссылка устарела" };
    if (err.status === 409)
      return { title: "Конфликт данных", description: "Такой объект уже существует. Обновите страницу" };
    if (err.status === 422)
      return { title: "Неверные данные", description: "Проверьте заполнение полей и попробуйте ещё раз" };
    if (err.status === 429)
      return { title: "Слишком много запросов", description: "Подождите минуту и попробуйте снова" };
    if (err.status >= 500)
      return { title: "Ошибка на сервере", description: "Мы уже разбираемся. Попробуйте через минуту" };

    return { title: "Произошла ошибка", description: "Попробуйте ещё раз или обновите страницу" };
  }

  // ── Plain Error (e.g. from manual fetch in mutationFn) ──────────────────
  if (err instanceof Error && err.message && err.message !== "[object Object]") {
    return { title: err.message };
  }

  // ── Unknown ─────────────────────────────────────────────────────────────
  return { title: "Что-то пошло не так", description: "Попробуйте ещё раз или обновите страницу" };
}

/** Convenience: single string for non-toast contexts (e.g. AI chat UI). */
export function extractErrorMessage(err: unknown): string {
  const { title, description } = getErrorToast(err);
  return description ? (title + ". " + description) : title;
}
