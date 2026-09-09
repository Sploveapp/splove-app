import { describe, expect, it, vi } from "vitest";
import { navigateToMoveHome } from "./chatConversationRoute";

describe("navigateToMoveHome", () => {
  it("remplace l'historique par /move", () => {
    const navigate = vi.fn();
    navigateToMoveHome(navigate);
    expect(navigate).toHaveBeenCalledWith("/move", { replace: true });
  });
});
