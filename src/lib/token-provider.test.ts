import { describe, expect, it, vi } from "vitest";
import { loadTokenFeedRequest } from "./api";
import { loadTokenFeed } from "./token-provider";

vi.mock("./api", () => ({
  loadTokenFeedRequest: vi.fn(),
}));

describe("token provider", () => {
  it("passes review mode and filters to the api client", async () => {
    vi.mocked(loadTokenFeedRequest).mockResolvedValue({
      items: [],
      sourceLabel: "Curated review queue",
      sourceKind: "hybrid",
      updatedAt: new Date().toISOString(),
      isLive: true,
      description: "ok",
      mode: "review",
      queueLabel: "Curated Review Queue",
      providerStatus: [],
      fallbackUsed: false,
    });

    const result = await loadTokenFeed({
      query: "SOL",
      riskLevel: "High Risk",
    });

    expect(loadTokenFeedRequest).toHaveBeenCalledWith({
      mode: "review",
      query: "SOL",
      riskLevel: "High Risk",
    });
    expect(result.sourceKind).toBe("hybrid");
    expect(result.queueLabel).toBe("Curated Review Queue");
  });
});
