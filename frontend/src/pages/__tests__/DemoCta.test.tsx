import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "../LandingPage";
import LoginPage from "../LoginPage";
import { WA_NUMBER } from "../../lib/whatsapp";

const CREDENTIAL_MARKERS = [
  "Demo" + "1234",
  "Admin" + "123!",
  "seller" + "@kantin.test",
  "admin" + "@kantin.com",
];

function renderPage(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={["/"]}>{ui}</MemoryRouter>,
  );
}

function waHref(): string {
  const link = screen.getByRole("link", { name: "Hubungi via WhatsApp" });
  return link.getAttribute("href") ?? "";
}

function expectNoCredentials() {
  const html = document.body.innerHTML;
  for (const marker of CREDENTIAL_MARKERS) {
    expect(html).not.toContain(marker);
  }
}

describe("CTA Minta akun demo — landing & login", () => {
  it("landing: CTA tampil dan membuka modal WhatsApp berisi link wa.me", () => {
    renderPage(<LandingPage />);

    const cta = screen.getByRole("button", { name: /Minta akun demo/ });
    expect(cta).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Hubungi via WhatsApp" }),
    ).toBeNull();

    fireEvent.click(cta);

    const href = waHref();
    expect(href).toContain(`https://wa.me/${WA_NUMBER}`);
    const pesan = decodeURIComponent(href.split("text=")[1] ?? "");
    expect(pesan).toMatch(/akun demo dashboard penjual/i);
    expectNoCredentials();
  });

  it("landing: tidak ada kredensial demo yang terekspos di DOM", () => {
    renderPage(<LandingPage />);
    expectNoCredentials();
    expect(screen.queryByText("Akun demo", { exact: true })).toBeNull();
  });

  it("landing: modal pendaftaran tetap berfungsi setelah refactor", () => {
    renderPage(<LandingPage />);

    fireEvent.click(screen.getByRole("button", { name: "Daftarkan resto kamu" }));
    expect(screen.getByText("Daftarkan restoranmu")).toBeInTheDocument();

    const href = waHref();
    expect(href).toContain(`https://wa.me/${WA_NUMBER}`);
    expect(decodeURIComponent(href.split("text=")[1] ?? "")).toMatch(
      /mendaftarkan restoran/i,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    expect(screen.queryByText("Daftarkan restoranmu")).toBeNull();
  });

  it("login: CTA tampil, membuka modal WhatsApp, form tetap kosong", () => {
    renderPage(<LoginPage />);

    const cta = screen.getByRole("button", { name: /Minta akun demo/ });
    expect(cta).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Hubungi via WhatsApp" }),
    ).toBeNull();

    fireEvent.click(cta);

    const href = waHref();
    expect(href).toContain(`https://wa.me/${WA_NUMBER}`);
    expect(decodeURIComponent(href.split("text=")[1] ?? "")).toMatch(
      /akun demo dashboard penjual/i,
    );
    expect(screen.getByPlaceholderText("email@restoran.com")).toHaveValue("");
    expect(screen.getByPlaceholderText("••••••••")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    expect(
      screen.queryByRole("link", { name: "Hubungi via WhatsApp" }),
    ).toBeNull();
    expectNoCredentials();
  });

  it("login: kartu autofill kredensial demo sudah dihapus", () => {
    renderPage(<LoginPage />);
    expectNoCredentials();
    expect(screen.queryByText("Akun demo", { exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Seller$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Admin$/ })).toBeNull();
  });
});
