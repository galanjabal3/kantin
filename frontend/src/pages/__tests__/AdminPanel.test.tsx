import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminPanel from "../AdminPanel";
import { useAuthStore } from "../../store/authStore";
import * as api from "../../lib/api";

vi.mock("../../lib/api", () => ({
  getAllRestaurants: vi.fn(),
  createRestaurant: vi.fn(),
  updateRestaurant: vi.fn(),
}));

const mockedApi = api as unknown as {
  getAllRestaurants: ReturnType<typeof vi.fn>;
  createRestaurant: ReturnType<typeof vi.fn>;
  updateRestaurant: ReturnType<typeof vi.fn>;
};

const RESTAURANT = {
  id: "r1",
  name: "Warung Bu Siti",
  slug: "warung-bu-siti",
  description: "Masakan rumahan",
  mode: "full",
  is_active: true,
  is_open: true,
};

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <AdminPanel />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ token: "admin-token", userType: "admin" });
  mockedApi.getAllRestaurants.mockResolvedValue([RESTAURANT]);
});

describe("B5 — admin toggle buka/tutup resto", () => {
  it("menampilkan switch Buka/Tutup untuk tiap resto (kartu mobile + tabel)", async () => {
    renderPanel();

    const switches = await screen.findAllByRole("switch", {
      name: "Buka/tutup Warung Bu Siti",
    });
    // dirender dua kali: layout mobile & layout desktop
    expect(switches).toHaveLength(2);
    expect(switches[0]).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByText("Buka")).toHaveLength(2);
    expect(mockedApi.getAllRestaurants).toHaveBeenCalled();
  });

  it("klik switch → PUT updateRestaurant parsial & badge berubah ke Tutup", async () => {
    mockedApi.updateRestaurant.mockResolvedValue({
      ...RESTAURANT,
      is_open: false,
    });
    renderPanel();

    const switches = await screen.findAllByRole("switch", {
      name: "Buka/tutup Warung Bu Siti",
    });
    fireEvent.click(switches[0]);

    await waitFor(() =>
      expect(mockedApi.updateRestaurant).toHaveBeenCalledWith(
        "admin-token",
        "r1",
        { is_open: false },
      ),
    );
    // Optimistik: kedua render (mobile + desktop) langsung ikut berubah
    expect(
      await screen.findAllByRole("switch", { checked: false }),
    ).toHaveLength(2);
    expect(screen.getAllByText("Tutup")).toHaveLength(2);
    expect(screen.queryByText("Buka")).not.toBeInTheDocument();
  });

  it("PUT gagal → status dikembalikan seperti semula", async () => {
    mockedApi.updateRestaurant.mockRejectedValue(
      new Error("Gagal mengupdate restoran"),
    );
    renderPanel();

    const switches = await screen.findAllByRole("switch", {
      name: "Buka/tutup Warung Bu Siti",
    });
    fireEvent.click(switches[0]);

    await waitFor(() =>
      expect(mockedApi.updateRestaurant).toHaveBeenCalledTimes(1),
    );
    // Rollback ke kondisi awal (buka)
    expect(
      await screen.findAllByRole("switch", { checked: true }),
    ).toHaveLength(2);
    expect(screen.getAllByText("Buka")).toHaveLength(2);
    expect(screen.queryByText("Tutup")).not.toBeInTheDocument();
  });
});
