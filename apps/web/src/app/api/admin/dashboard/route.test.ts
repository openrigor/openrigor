import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  getAdminDashboardData: vi.fn(),
  isAdminDashboardEnabled: vi.fn(),
  isPlatformAdmin: vi.fn(),
  verifyUserAuthenticated: vi.fn(),
}));

vi.mock("@/lib/admin/dashboard", () => ({
  getAdminDashboardData: harness.getAdminDashboardData,
}));
vi.mock("@/lib/admin/guard", () => ({
  isAdminDashboardEnabled: harness.isAdminDashboardEnabled,
  isPlatformAdmin: harness.isPlatformAdmin,
}));
vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));

import { GET } from "./route";

describe("GET /api/admin/dashboard", () => {
  beforeEach(() => {
    harness.getAdminDashboardData.mockReset().mockResolvedValue({
      registrations: { total: 1 },
    });
    harness.isAdminDashboardEnabled.mockReset().mockReturnValue(true);
    harness.isPlatformAdmin.mockReset().mockReturnValue(true);
    harness.verifyUserAuthenticated.mockReset().mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com" },
      session: { access_token: "token" },
    });
  });

  it("returns 404 before auth when the dashboard is disabled", async () => {
    harness.isAdminDashboardEnabled.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(404);
    expect(harness.verifyUserAuthenticated).not.toHaveBeenCalled();
  });

  it("returns 401 for an unauthenticated request", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue(undefined);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns 404 for an authenticated non-admin", async () => {
    harness.isPlatformAdmin.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(404);
    expect(harness.getAdminDashboardData).not.toHaveBeenCalled();
  });

  it("returns the server-aggregated dashboard for an admin", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ registrations: { total: 1 } });
    expect(harness.isPlatformAdmin).toHaveBeenCalledWith({
      id: "admin-1",
      email: "admin@example.com",
    });
  });
});
