import "server-only";
import { refresh } from "next/cache";

/**
 * `refresh()` re-renders the admin page that called a Server Action. The
 * Hello Tidy admin app's API (src/lib/mobile) runs the same actions from a Route
 * Handler, where Next.js throws "refresh can only be called from within a
 * Server Action" and there is no page to refresh. Swallowing only that case
 * keeps the action's own error handling (and its `after()` notifications)
 * intact. The action files import this as `refresh`.
 */
export function refreshAdminView(): void {
  try {
    refresh();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("refresh can only be called")) return;
    throw error;
  }
}
