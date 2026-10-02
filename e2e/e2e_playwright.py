#!/usr/bin/env python3
"""E2E test + screenshot generator untuk app Kantin (Playwright, async).

Cara pakai
----------
  /Users/galanjabal/Documents/Portfolios/venv-portfolios/bin/python \
      /Users/galanjabal/Documents/Portfolios/kantin/e2e/e2e_playwright.py

Prasyarat (sudah berjalan, jangan di-restart):
  - Backend : http://127.0.0.1:8000  (/health -> 200)
  - Frontend: http://localhost:5174  (Vite dev)
  - Browser chromium Playwright sudah terpasang di venv venv-portfolios.

Output
------
  - Screenshot : /Users/galanjabal/Documents/Portfolios/kantin-shots/{mobile,desktop}/NN-nama.png
  - files.json : daftar semua path screenshot (ditulis ulang tiap run)
  - audit.txt  : audit overflow horizontal + kontras teks (WCAG AA)

Aturan main
-----------
  - TIDAK menyentuh kode aplikasi (frontend/src, backend/app).
  - TIDAK commit / add / push / install paket.
  - Script ini file baru (untracked) — boleh dibiarkan.
  - Rate limit backend: login 5/menit -> cuma 2 login per run
    (seller + admin), dengan retry + jeda 65 dtk kalau kena 429.
  - Status keluar: 0 = semua skenario PASSED, 1 = ada yang FAILED.

Struktur: satu fungsi per skenario, assertion nyata (bukan cuma screenshot),
main() menjalankan semuanya lalu mencetak ringkasan PASSED/FAILED.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Awaitable, Callable

from playwright.async_api import Page, async_playwright

FE = "http://localhost:5174"
BE = "http://127.0.0.1:8000"
SLUG = "kantin-demo"
TAG = time.strftime("%H%M")
NAME_M = f"E2E Mobile {TAG}"
NAME_D = f"E2E Desktop {TAG}"
CASH_M = f"Kasir E2E {TAG}"
CASH_D = f"Kasir E2E Desktop {TAG}"
OUT = Path("/Users/galanjabal/Documents/Portfolios/kantin-shots")
MOBILE = {"width": 390, "height": 844}
DESKTOP = {"width": 1440, "height": 1000}
DSF = 2

SELLER_EMAIL = "seller@kantin.test"
SELLER_PW = "Demo1234!"
ADMIN_EMAIL = "admin@kantin.com"
ADMIN_PW = "Admin123!"

MENU_CARD = 'div[class*="bg-white"][class*="p-4"][class*="flex gap-3"]'
CARD_ACTIVE = 'div[class*="rounded-xl"][class*="md:p-5"]'
CARD_DONE = 'div[class*="bg-gray-50"][class*="px-4 py-3"]'

STALE = ["03-landing-demo-slug-broken.png", "04-login.png"]

LEAK_MARKERS = ["Demo1234", "Admin123!", "seller@kantin.test", "admin@kantin.com"]

RESULTS: list[list[str]] = []
AUDIT_ROWS: list[dict[str, Any]] = []


def ck(cond: Any, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


async def ck_no_creds(page: Page, where: str) -> None:
    html = await page.content()
    for s in LEAK_MARKERS:
        ck(s not in html, f"kredensial {s} bocor di {where}")


def rp(n: int) -> str:
    return "Rp" + f"{n:,}".replace(",", ".")


async def shot(page: Page, folder: str, name: str, full_page: bool = True) -> None:
    d = OUT / folder
    d.mkdir(parents=True, exist_ok=True)
    await page.screenshot(path=str(d / name), full_page=full_page)
    print(f"    shot {folder}/{name}")


async def goto_menu(page: Page) -> None:
    await page.goto(f"{FE}/r/{SLUG}", wait_until="domcontentloaded")
    await page.get_by_text("Kantin Demo").first.wait_for(timeout=15000)
    await page.locator(MENU_CARD).first.wait_for(timeout=15000)


async def menu_count(page: Page) -> int:
    return await page.locator(MENU_CARD).count()


async def card_of(page: Page, name: str):
    el = page.get_by_text(name, exact=True).first
    return el.locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]")


async def login(page: Page, email: str, password: str, expect_path: str) -> None:
    for attempt in range(3):
        await page.goto(FE + "/login", wait_until="domcontentloaded")
        await page.locator("input[type=email]").wait_for(timeout=10000)
        await page.locator("input[type=email]").fill(email)
        await page.locator("input[type=password]").fill(password)
        await page.get_by_role("button", name="Masuk", exact=True).click()
        t0 = time.time()
        while time.time() - t0 < 6:
            if page.url.rstrip("/").endswith(expect_path):
                return
            await asyncio.sleep(0.2)
        body = await page.inner_text("body")
        if re.search(r"rate limit|terlalu banyak|\b429\b", body, re.I):
            print(f"    login kena rate limit, tunggu 65 dtk (attempt {attempt + 1})")
            await asyncio.sleep(65)
            continue
        raise AssertionError(f"login {email} tidak sampai {expect_path}: {body[:160]!r}")
    raise AssertionError(f"login {email} gagal terus karena rate limit")


async def wait_resto_open(expected: bool, timeout: float = 6.0) -> None:
    t0 = time.time()
    last: Any = None
    while time.time() - t0 < timeout:
        last = http_json(f"{BE}/api/r/{SLUG}").get("is_open")
        if last is expected:
            return
        await asyncio.sleep(0.4)
    raise AssertionError(f"backend is_open={last!r}, seharusnya {expected} (timeout {timeout}s)")


async def run(label: str, st: dict[str, Any], fn: Callable[[], Awaitable[None]]) -> None:
    print(f"\n=== {label}")
    try:
        await fn()
    except Exception as e:  # noqa: BLE001
        msg = f"{type(e).__name__}: {e}"
        page = st.get("cur")
        folder = st.get("folder", "mobile")
        if page is not None:
            try:
                await shot(page, folder, f"fail-{label}.png", full_page=False)
            except Exception:  # noqa: BLE001
                pass
        RESULTS.append([label, "FAILED", msg])
        print(f"FAILED {label} -> {msg}")
    else:
        RESULTS.append([label, "PASSED", ""])
        print(f"PASSED {label}")


AUDIT_JS = r"""
() => {
  const cv = document.createElement('canvas');
  cv.width = 1; cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const toRGB = (c) => {
    if (!c || !window.CSS || !CSS.supports('color', c)) return null;
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, 1, 1);
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const lum = (rgb) => {
    const f = rgb.map((v) => {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const isTransparent = (c) => !c || c === 'transparent' || /,\s*0\s*\)\s*$/.test(c);
  const bgOf = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const c = getComputedStyle(n).backgroundColor;
      if (!isTransparent(c)) return c;
      n = n.parentElement;
    }
    return 'rgb(255, 255, 255)';
  };
  const issues = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[aria-hidden="true"]')) continue;
    let text = '';
    for (const node of el.childNodes) if (node.nodeType === 3) text += node.nodeValue;
    text = text.trim();
    if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.1) continue;
    const bgRaw = bgOf(el);
    const fg = toRGB(cs.color);
    const bg = toRGB(bgRaw);
    if (!fg || !bg) continue;
    const fs = parseFloat(cs.fontSize) || 0;
    const fw = parseInt(cs.fontWeight, 10) || 400;
    const need = (fs >= 24 || (fs >= 18.66 && fw >= 700)) ? 3 : 4.5;
    const cr = Math.round(ratio(fg, bg) * 100) / 100;
    if (cr < need) {
      issues.push({ txt: text.slice(0, 70), fs: Math.round(fs), fw, cr, need,
                    color: cs.color, bg: bgRaw });
    }
  }
  const doc = document.documentElement;
  return {
    overflow: doc.scrollWidth > window.innerWidth,
    scrollWidth: doc.scrollWidth,
    innerWidth: window.innerWidth,
    contrast: issues.slice(0, 40),
    contrastTotal: issues.length,
  };
}
"""


async def audit_page(page: Page, label: str, url: str | None, vp: str) -> None:
    st = AUDIT_ROWS
    if url:
        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(1200)
    data = await page.evaluate(AUDIT_JS)
    st.append(
        {
            "label": label,
            "url": page.url,
            "viewport": f"{vp} {DESKTOP['width']}x{DESKTOP['height']}"
            if vp == "desktop"
            else f"{vp} {MOBILE['width']}x{MOBILE['height']}",
            **data,
        }
    )
    print(f"    audit {label}: overflow={data['overflow']} kontras={data['contrastTotal']}")


def write_files_json() -> list[str]:
    paths: list[str] = []
    for d in ("mobile", "desktop"):
        paths.extend(str(p) for p in sorted((OUT / d).glob("*.png")))
    (OUT / "files.json").write_text(json.dumps(paths, indent=1) + "\n", encoding="utf-8")
    return paths


def write_audit() -> None:
    lines = ["=== AUDIT UI Kantin (otomatis, E2E Playwright) ===", ""]
    for row in AUDIT_ROWS:
        lines.append(f"[{row['label']}] {row['url']} @ {row['viewport']}")
        if row["overflow"]:
            lines.append(
                f"  overflow horizontal: YA (scrollWidth={row['scrollWidth']} "
                f"innerWidth={row['innerWidth']})"
            )
        else:
            lines.append(
                f"  overflow horizontal: tidak (scrollWidth={row['scrollWidth']} "
                f"innerWidth={row['innerWidth']})"
            )
        lines.append(f"  kontras < standar: {row['contrastTotal']} teks")
        for it in row["contrast"]:
            lines.append(
                f'    - "{it["txt"]}" {it["fs"]}px/{it["fw"]} cr={it["cr"]} '
                f'need={it["need"]} color={it["color"]} bg={it["bg"]}'
            )
        lines.append("")
    (OUT / "audit.txt").write_text("\n".join(lines), encoding="utf-8")


def http_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read().decode())


def clean_stale() -> None:
    for folder in ("mobile", "desktop"):
        d = OUT / folder
        if not d.is_dir():
            continue
        for p in d.glob("fail-*.png"):
            p.unlink()
        for name in STALE:
            (d / name).unlink(missing_ok=True)


async def main() -> int:
    print("E2E Kantin — Playwright (async)")
    print(f"  script : {Path(__file__).resolve()}")
    print(f"  output : {OUT}")

    try:
        with urllib.request.urlopen(BE + "/health", timeout=5) as r:
            ck(r.status == 200, f"health BE = {r.status}")
        with urllib.request.urlopen(FE + "/", timeout=5) as r:
            ck(r.status == 200, f"FE = {r.status}")
    except Exception as e:  # noqa: BLE001
        print(f"SERVER TIDAK HIDUP: {e}")
        return 2

    menu = http_json(f"{BE}/api/r/{SLUG}/menu")
    ck(len(menu) == 11, f"seed menu = {len(menu)}, expect 11")
    harga = {m["name"]: int(m["price"]) for m in menu}
    total_m = harga["Nasi Goreng"] + harga["Es Teh"]
    total_d = harga["Ayam Geprek"] + harga["Kopi Susu"]
    clean_stale()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        try:
            st: dict[str, Any] = {"cur": None, "folder": "mobile"}
            cust = await browser.new_context(viewport=MOBILE, device_scale_factor=DSF)
            aux = await browser.new_context(viewport=MOBILE, device_scale_factor=DSF)
            st["aux"] = aux
            p1 = await cust.new_page()
            p1.set_default_timeout(15000)
            st["cust"] = cust
            st["p1"] = p1
            st["cur"] = p1

            await p1.goto(FE + "/", wait_until="domcontentloaded")
            await p1.evaluate("localStorage.removeItem('kantin-active-order-" + SLUG + "')")

            async def a01() -> None:
                st["cur"], st["folder"] = p1, "mobile"
                await p1.goto(FE + "/", wait_until="networkidle")
                await p1.get_by_role("button", name=re.compile("Lihat demo menu")).wait_for()
                await ck_no_creds(p1, "landing mobile")
                cta_demo = p1.get_by_role("button", name=re.compile("Minta akun demo"))
                ck(await cta_demo.count() >= 1, "CTA Minta akun demo tidak ada di landing")
                await cta_demo.first.click()
                await p1.get_by_text("Minta akun demo", exact=True).wait_for()
                href = await p1.get_by_role("link", name=re.compile("Hubungi via WhatsApp")).get_attribute("href")
                ck(href and "wa.me" in href, f"link WhatsApp modal demo aneh: {href}")
                await p1.get_by_role("button", name="Tutup", exact=True).click()
                await p1.get_by_text("Minta akun demo", exact=True).wait_for(state="detached")
                ck(
                    await p1.get_by_role("button", name=re.compile("Daftarkan resto kamu")).is_visible(),
                    "CTA pendaftaran tidak terlihat",
                )
                await shot(p1, "mobile", "01-landing.png")

            async def a02() -> None:
                st["cur"], st["folder"] = p1, "mobile"
                await p1.get_by_role("button", name="Daftarkan resto kamu").click()
                await p1.get_by_text("Daftarkan restoranmu").wait_for()
                href = await p1.get_by_role("link", name=re.compile("Hubungi via WhatsApp")).get_attribute("href")
                ck(href and "wa.me" in href, f"link WhatsApp aneh: {href}")
                await shot(p1, "mobile", "02-landing-modal.png", full_page=False)
                await p1.get_by_role("button", name="Tutup", exact=True).click()
                await p1.get_by_text("Daftarkan restoranmu").wait_for(state="detached")

            async def a03() -> None:
                st["cur"], st["folder"] = p1, "mobile"
                await p1.get_by_role("button", name=re.compile("Lihat demo menu")).click()
                await p1.wait_for_url(f"**/r/{SLUG}", timeout=10000)
                await goto_menu(p1)
                n = await menu_count(p1)
                ck(n == 11, f"menu tampil {n} item, expect 11")
                ck(await p1.get_by_text("Restoran tidak ditemukan").count() == 0, "REGRESI slug 404 muncul")
                cats = await p1.get_by_role("button", name="Semua").count()
                ck(cats == 1, "chip Semua tidak ada")
                await shot(p1, "mobile", "03-landing-demo-menu.png")
                await shot(p1, "mobile", "06-menu-public.png")

            async def a04() -> None:
                st["folder"] = "mobile"
                sk = await aux.new_page()
                st["cur"] = sk
                sk.set_default_timeout(15000)

                async def slow(route):
                    await asyncio.sleep(2.5)
                    await route.continue_()

                await sk.route(f"**/api/r/{SLUG}/menu", slow)
                await sk.goto(f"{FE}/r/{SLUG}", wait_until="commit")
                await asyncio.sleep(0.6)
                ck(await sk.locator(".animate-pulse").count() > 0, "skeleton .animate-pulse tidak terlihat")
                await shot(sk, "mobile", "05-menu-loading-skeleton.png")
                await sk.get_by_text("Kantin Demo").first.wait_for(timeout=20000)
                ck(await menu_count(sk) == 11, "menu tidak termuat setelah skeleton")
                await sk.close()
                st["cur"] = p1

            async def a05() -> None:
                st["folder"] = "mobile"
                lp = await aux.new_page()
                st["cur"] = lp
                lp.set_default_timeout(15000)
                await lp.goto(FE + "/login", wait_until="networkidle")
                await ck_no_creds(lp, "halaman login mobile")
                ck(
                    await lp.locator("input[type=email]").input_value() == "",
                    "field email tidak kosong (autofill demo seharusnya sudah dihapus)",
                )
                cta = lp.get_by_role("button", name=re.compile("Minta akun demo"))
                await cta.wait_for()
                ck(await cta.is_visible(), "CTA Minta akun demo tidak terlihat di login")
                await cta.click()
                await lp.get_by_text("Minta akun demo", exact=True).wait_for()
                href = await lp.get_by_role("link", name=re.compile("Hubungi via WhatsApp")).get_attribute("href")
                ck(href and "wa.me" in href, f"link WhatsApp CTA demo aneh: {href}")
                await ck_no_creds(lp, "modal demo login mobile")
                await shot(lp, "mobile", "05-login-cta-demo.png")
                await lp.get_by_role("button", name="Tutup", exact=True).click()
                await lp.get_by_text("Minta akun demo", exact=True).wait_for(state="detached")
                await lp.close()
                st["cur"] = p1

            async def a06() -> None:
                st["cur"], st["folder"] = p1, "mobile"
                await p1.get_by_role("button", name="Minuman", exact=True).click()
                n = await menu_count(p1)
                ck(n == 3, f"filter Minuman = {n} item, expect 3")
                await shot(p1, "mobile", "07-menu-category-filtered.png")
                await p1.get_by_role("button", name="Semua", exact=True).click()
                ck(await menu_count(p1) == 11, "kembali ke Semua != 11")

            async def a07() -> None:
                st["cur"], st["folder"] = p1, "mobile"
                for nama in ("Nasi Goreng", "Es Teh"):
                    card = await card_of(p1, nama)
                    await card.locator("button.w-7.h-7").first.click()
                await p1.get_by_text("Lihat keranjang").wait_for()
                ck(await p1.get_by_text("2 item", exact=True).count() > 0, "badge 2 item tidak muncul")
                bar = await p1.get_by_role("button", name=re.compile("Lihat keranjang")).inner_text()
                digits = re.sub(r"\D", "", bar)
                ck(str(total_m) in digits, f"total cart {digits} != {total_m}")
                await shot(p1, "mobile", "08-menu-with-cart-bar.png")

            async def a08() -> None:
                st["cur"], st["folder"] = p1, "mobile"
                await p1.get_by_text("Lihat keranjang").click()
                await p1.get_by_text("Keranjang", exact=True).wait_for()
                for nama in ("Nasi Goreng", "Es Teh"):
                    ck(await p1.get_by_text(nama, exact=True).count() > 0, f"{nama} tidak ada di cart")
                ck(await p1.get_by_text("Lanjut ke checkout").count() == 1, "tombol checkout tidak ada")
                await shot(p1, "mobile", "09-cart.png")

            async def a09() -> None:
                st["cur"], st["folder"] = p1, "mobile"
                await p1.get_by_text("Lanjut ke checkout").click()
                await p1.get_by_text("Konfirmasi pesanan").wait_for()
                ck(
                    await p1.get_by_placeholder("Contoh: Meja 5").count() == 1,
                    "field nomor meja tidak ada (enable_table_number=true)",
                )
                btn = p1.get_by_role("button", name="Masukkan nama dulu")
                await btn.wait_for()
                ck(await btn.is_disabled(), "tombol pesan seharusnya disabled saat nama kosong")
                await shot(p1, "mobile", "10-checkout-empty-name.png")

            async def a10() -> None:
                st["cur"], st["folder"] = p1, "mobile"
                await p1.get_by_placeholder("Masukkan nama kamu").fill(NAME_M)
                await p1.get_by_placeholder("Contoh: Meja 5").fill("Meja 7")
                btn = p1.get_by_role("button", name="Pesan sekarang")
                await btn.wait_for()
                ck(not await btn.is_disabled(), "tombol Pesan sekarang masih disabled")
                total_txt = await p1.locator("div.border-t").last.inner_text()
                digits = re.sub(r"\D", "", total_txt)
                ck(str(total_m) in digits, f"total checkout {digits} != {total_m}")
                await shot(p1, "mobile", "11-checkout-filled.png")

            async def a11() -> None:
                st["cur"], st["folder"] = p1, "mobile"
                await p1.get_by_role("button", name="Pesan sekarang").click()
                await p1.get_by_text("Status pesanan").wait_for(timeout=15000)
                await p1.get_by_text("Menunggu konfirmasi").wait_for()
                card_txt = await p1.locator("div.bg-white.rounded-2xl").first.inner_text()
                digits = re.sub(r"\D", "", card_txt)
                ck(str(total_m) in digits, f"total tracking {digits} != {total_m}")
                key = await p1.evaluate(f"localStorage.getItem('kantin-active-order-{SLUG}')")
                ck(key and "orderId" in key, "active order tidak tersimpan di localStorage")
                await shot(p1, "mobile", "12-tracking-pending.png")

            async def a12() -> None:
                st["cur"], st["folder"] = p1, "mobile"
                await p1.get_by_text("← Kembali ke menu").click()
                await p1.get_by_text("Pesanan aktif").wait_for()
                ck(await p1.get_by_text("Lihat status", exact=False).count() > 0, "tombol Lihat status tidak ada")
                await shot(p1, "mobile", "24-tracking-soft-exit.png")
                await p1.get_by_text("Lihat status").click()
                await p1.get_by_text("Status pesanan").wait_for()

            async def a13() -> None:
                """Opsi A (cancel persist): 'Tidak' batal dulu, lalu 'Ya'.

                'Ya' → POST /cancel dipanggil → keluar dari tracking, sesi
                localStorage dibuang, dan riwayat lokal menampilkan
                "Dibatalkan" (status ikut persist di server).
                """
                st["cur"], st["folder"] = p1, "mobile"
                await p1.get_by_text("Batalkan pesanan").click()
                await p1.get_by_text("Yakin membatalkan pesanan?").wait_for()
                await shot(p1, "mobile", "25-cancel-confirm.png", full_page=False)

                # "Tidak" → konfirmasi dibatalkan, TIDAK ada API, tetap tracking
                await p1.get_by_role("button", name="Tidak", exact=True).click()
                await p1.get_by_text("Yakin membatalkan pesanan?").wait_for(state="detached")
                ck(
                    await p1.get_by_text("Status pesanan").count() == 1,
                    "'Tidak' seharusnya tetap di tracking",
                )

                # "Ya" → pembatalan dikirim ke server, lalu sesi dibuang
                await p1.get_by_text("Batalkan pesanan").click()
                await p1.get_by_text("Yakin membatalkan pesanan?").wait_for()
                await p1.get_by_role("button", name="Ya", exact=True).click()
                await p1.get_by_text("Status pesanan").wait_for(state="detached", timeout=15000)
                key = await p1.evaluate(f"localStorage.getItem('kantin-active-order-{SLUG}')")
                ck(not key, f"sesi order masih ada setelah batal: {key}")
                ck(
                    await p1.get_by_text("Pesanan aktif").count() == 0,
                    "bar Pesanan aktif masih tampil setelah batal",
                )

                # Riwayat lokal langsung menampilkan label "Dibatalkan"
                await p1.get_by_text("Riwayat pesanan").wait_for(timeout=15000)
                hist = p1.get_by_text("Riwayat pesanan").locator(
                    "xpath=ancestor::div[contains(@class,'rounded-xl')][1]"
                )
                ck(
                    await hist.get_by_text("Dibatalkan", exact=True).count() >= 1,
                    "riwayat tidak menampilkan 'Dibatalkan' setelah batal",
                )

            async def a14() -> None:
                st["cur"], st["folder"] = p1, "mobile"
                # A13 sudah membatalkan → posisi sudah di menu. Keluar dulu
                # hanya bila ternyata masih berada di layar tracking.
                if await p1.get_by_text("← Kembali ke menu").count() > 0:
                    await p1.get_by_text("← Kembali ke menu").click()
                await p1.get_by_text("Riwayat pesanan").wait_for()
                rows = p1.locator('div[class*="divide-y"] > *')
                n = await rows.count()
                ck(n >= 1, f"riwayat {n} entri, expect >= 1")
                digits = re.sub(r"\D", "", await rows.first.inner_text())
                ck(str(total_m) in digits, f"riwayat tidak memuat total {total_m}: {digits}")
                await p1.get_by_text("Riwayat pesanan").scroll_into_view_if_needed()
                await shot(p1, "mobile", "26-order-history.png")

            async def a15() -> None:
                st["folder"] = "mobile"
                np_ = await aux.new_page()
                st["cur"] = np_
                np_.set_default_timeout(15000)
                await np_.goto(f"{FE}/r/slug-tidak-ada", wait_until="domcontentloaded")
                await np_.get_by_text("Restoran tidak ditemukan").wait_for(timeout=15000)
                ck(await np_.get_by_text("Tidak bisa terhubung ke server").count() == 0, "pesan error salah utk 404")
                ck(await np_.get_by_text("Kembali ke beranda").count() > 0, "tombol beranda tidak ada")
                await shot(np_, "mobile", "27-restaurant-404.png")
                await np_.close()
                st["cur"] = p1

            async def a16() -> None:
                st["folder"] = "mobile"
                np_ = await aux.new_page()
                st["cur"] = np_
                np_.set_default_timeout(15000)

                async def abort(route):
                    await route.abort()

                pat = f"**/api/r/{SLUG}**"
                await np_.route(pat, abort)
                await np_.goto(f"{FE}/r/{SLUG}", wait_until="domcontentloaded")
                await np_.get_by_text("Tidak bisa terhubung ke server").wait_for(timeout=15000)
                ck(await np_.get_by_role("button", name="Coba lagi").count() > 0, "tombol Coba lagi tidak ada")
                ck(await np_.get_by_text("Restoran tidak ditemukan").count() == 0, "error jaringan salah label 404")
                await shot(np_, "mobile", "28-network-error.png")
                await np_.unroute(pat)
                await np_.get_by_role("button", name="Coba lagi").click()
                await goto_menu(np_)
                ck(await menu_count(np_) == 11, "retry gagal memuat menu")
                await np_.close()
                st["cur"] = p1

            async def a17() -> None:
                p2 = await cust.new_page()
                p2.set_default_timeout(15000)
                await p2.set_viewport_size(DESKTOP)
                st["p2"] = p2
                st["cur"], st["folder"] = p2, "desktop"
                await p2.goto(FE + "/", wait_until="domcontentloaded")
                await p2.evaluate("localStorage.removeItem('kantin-active-order-" + SLUG + "')")
                await p2.goto(FE + "/", wait_until="networkidle")
                await p2.get_by_role("button", name=re.compile("Lihat demo menu")).wait_for()
                await ck_no_creds(p2, "landing desktop")
                ck(
                    await p2.get_by_role("button", name=re.compile("Minta akun demo")).count() >= 1,
                    "CTA Minta akun demo tidak ada di landing (desktop)",
                )
                await shot(p2, "desktop", "01-landing.png")
                await p2.get_by_role("button", name="Daftarkan resto kamu").click()
                await p2.get_by_text("Daftarkan restoranmu").wait_for()
                await shot(p2, "desktop", "02-landing-modal.png", full_page=False)
                await p2.get_by_role("button", name="Tutup", exact=True).click()
                await p2.get_by_text("Daftarkan restoranmu").wait_for(state="detached")
                await p2.get_by_role("button", name=re.compile("Lihat demo menu")).click()
                await p2.wait_for_url(f"**/r/{SLUG}", timeout=10000)
                await goto_menu(p2)
                ck(await menu_count(p2) == 11, "menu desktop != 11")
                ck(await p2.get_by_text("Restoran tidak ditemukan").count() == 0, "REGRESI slug 404 (desktop)")
                await shot(p2, "desktop", "03-landing-demo-menu.png")
                await shot(p2, "desktop", "06-menu-public.png")

            async def a18() -> None:
                p2 = st["p2"]
                st["cur"], st["folder"] = p2, "desktop"
                await p2.get_by_role("button", name="Minuman", exact=True).click()
                ck(await menu_count(p2) == 3, "filter Minuman desktop != 3")
                await shot(p2, "desktop", "07-menu-category-filtered.png")
                await p2.get_by_role("button", name="Semua", exact=True).click()

            async def a19() -> None:
                p2 = st["p2"]
                st["cur"], st["folder"] = p2, "desktop"
                for nama in ("Ayam Geprek", "Kopi Susu"):
                    card = await card_of(p2, nama)
                    await card.locator("button.w-7.h-7").first.click()
                await p2.get_by_text("Lihat keranjang").wait_for()
                ck(await p2.get_by_text("2 item", exact=True).count() > 0, "badge 2 item desktop tidak muncul")
                await shot(p2, "desktop", "08-menu-with-cart-bar.png")
                await p2.get_by_text("Lihat keranjang").click()
                await p2.get_by_text("Keranjang", exact=True).wait_for()
                await shot(p2, "desktop", "09-cart.png")
                await p2.get_by_text("Lanjut ke checkout").click()
                await p2.get_by_text("Konfirmasi pesanan").wait_for()
                ck(await p2.get_by_placeholder("Contoh: Meja 5").count() == 1, "field meja desktop tidak ada")
                btn = p2.get_by_role("button", name="Masukkan nama dulu")
                await btn.wait_for()
                ck(await btn.is_disabled(), "tombol pesan desktop tidak disabled saat nama kosong")
                await shot(p2, "desktop", "10-checkout-empty-name.png")
                await p2.get_by_placeholder("Masukkan nama kamu").fill(NAME_D)
                await p2.get_by_placeholder("Contoh: Meja 5").fill("Meja 2")
                ok = p2.get_by_role("button", name="Pesan sekarang")
                await ok.wait_for()
                ck(not await ok.is_disabled(), "tombol Pesan sekarang desktop disabled")
                total_txt = await p2.locator("div.border-t").last.inner_text()
                ck(str(total_d) in re.sub(r"\D", "", total_txt), "total checkout desktop salah")
                await shot(p2, "desktop", "11-checkout-filled.png")
                await p2.get_by_role("button", name="Pesan sekarang").click()
                await p2.get_by_text("Status pesanan").wait_for(timeout=15000)
                await p2.get_by_text("Menunggu konfirmasi").wait_for()
                card_txt = await p2.locator("div.bg-white.rounded-2xl").first.inner_text()
                ck(str(total_d) in re.sub(r"\D", "", card_txt), "total tracking desktop salah")
                await shot(p2, "desktop", "12-tracking-pending.png")

            async def a20() -> None:
                st["folder"] = "desktop"
                lp = await cust.new_page()
                st["cur"] = lp
                lp.set_default_timeout(15000)
                await lp.goto(FE + "/login", wait_until="networkidle")
                await ck_no_creds(lp, "halaman login desktop")
                ck(
                    await lp.locator("input[type=email]").input_value() == "",
                    "field email desktop tidak kosong (autofill demo seharusnya sudah dihapus)",
                )
                cta = lp.get_by_role("button", name=re.compile("Minta akun demo"))
                await cta.wait_for()
                ck(await cta.is_visible(), "CTA Minta akun demo tidak terlihat (desktop)")
                await cta.click()
                await lp.get_by_text("Minta akun demo", exact=True).wait_for()
                href = await lp.get_by_role("link", name=re.compile("Hubungi via WhatsApp")).get_attribute("href")
                ck(href and "wa.me" in href, f"link WhatsApp CTA demo aneh (desktop): {href}")
                await ck_no_creds(lp, "modal demo login desktop")
                await shot(lp, "desktop", "05-login-cta-demo.png")
                await lp.get_by_role("button", name="Tutup", exact=True).click()
                await lp.get_by_text("Minta akun demo", exact=True).wait_for(state="detached")
                await lp.close()
                st["cur"] = st.get("p2")

            async def b01() -> None:
                sc = await browser.new_context(viewport=MOBILE, device_scale_factor=DSF)
                await sc.add_init_script("window.print = function () {};")
                sp = await sc.new_page()
                sp.set_default_timeout(15000)
                st["seller"] = sc
                st["sp"] = sp
                st["cur"], st["folder"] = sp, "mobile"
                await login(sp, SELLER_EMAIL, SELLER_PW, "/dashboard")
                await sp.get_by_role("button", name="Kasir").wait_for(timeout=15000)
                ck("/dashboard" in sp.url, f"url sesudah login seller: {sp.url}")

            async def b02() -> None:
                sp = st["sp"]
                st["cur"], st["folder"] = sp, "mobile"
                await sp.get_by_text(NAME_M).first.wait_for(timeout=15000)
                ck(await sp.get_by_text(NAME_D).count() > 0, "order E2E Desktop tidak muncul di dashboard seller")
                ck(await sp.get_by_text("Total hari ini").count() > 0, "kartu statistik tidak ada")

                # Opsi A: order yang dibatalkan pelanggan (A13) tampil di
                # section terpisah "Dibatalkan (n)" — TANPA tombol aksi —
                # dan KELUAR dari papan kerja aktif.
                sect_p = sp.get_by_text(re.compile(r"^Dibatalkan \(\d+\)$")).first
                await sect_p.wait_for(timeout=15000)
                sect = sect_p.locator("xpath=..")
                ck(
                    await sect.get_by_text(NAME_M).count() >= 1,
                    "order batal tidak ada di section Dibatalkan",
                )
                ck(
                    await sect.locator("button").count() == 0,
                    "section Dibatalkan seharusnya tanpa tombol aksi",
                )
                ck(
                    await sp.locator(CARD_ACTIVE).filter(has_text=NAME_M).count() == 0,
                    "order batal masih berada di papan pesanan aktif",
                )
                await shot(sp, "mobile", "13-dashboard-orders.png")

            async def b03() -> None:
                sp = st["sp"]
                st["cur"], st["folder"] = sp, "mobile"
                row = sp.locator(CARD_ACTIVE).filter(has_text=NAME_D).first
                await row.get_by_role("button", name="Proses").click()
                await row.get_by_text("Diproses", exact=True).wait_for(timeout=10000)
                await row.get_by_role("button", name="Siap").wait_for(timeout=10000)

            async def b04() -> None:
                p2 = st["p2"]
                st["cur"], st["folder"] = p2, "desktop"
                await p2.get_by_text("Sedang diproses").wait_for(timeout=15000)
                ck(await p2.get_by_text("Menunggu konfirmasi").count() == 0, "status lama masih tampil")
                await shot(p2, "desktop", "29-status-preparing.png")

            async def b05() -> None:
                sp = st["sp"]
                st["cur"], st["folder"] = sp, "mobile"
                row = sp.locator(CARD_ACTIVE).filter(has_text=NAME_D).first
                await row.get_by_role("button", name="Siap").click()
                await row.get_by_text("Siap", exact=True).wait_for(timeout=10000)
                await row.get_by_role("button", name="Selesai").wait_for(timeout=10000)
                await row.get_by_role("button", name="Selesai").click()
                done = sp.locator(CARD_DONE).filter(has_text=NAME_D)
                await done.first.wait_for(timeout=10000)
                ck(await sp.get_by_text("Selesai hari ini").count() > 0, "seksi Selesai hari ini tidak ada")
                await shot(sp, "mobile", "31-seller-order-done.png")

            async def b06() -> None:
                p2 = st["p2"]
                st["cur"], st["folder"] = p2, "desktop"
                await p2.get_by_text("Selesai", exact=True).first.wait_for(timeout=15000)
                await p2.get_by_role("button", name="Pesan lagi").wait_for(timeout=15000)
                await shot(p2, "desktop", "30-pesan-lagi.png", full_page=False)
                await p2.get_by_role("button", name="Pesan lagi").click()
                await p2.get_by_text("Riwayat pesanan").wait_for(timeout=10000)
                rows = p2.locator('div[class*="divide-y"] > *')
                n = await rows.count()
                ck(n >= 2, f"riwayat setelah Pesan lagi = {n}, expect >= 2")
                await p2.get_by_text("Riwayat pesanan").scroll_into_view_if_needed()
                await shot(p2, "desktop", "26-order-history.png")

            async def b07() -> None:
                sp = st["sp"]
                st["cur"], st["folder"] = sp, "mobile"
                await sp.get_by_role("button", name="Kasir", exact=True).click()
                await sp.get_by_text("Tap menu untuk menambahkan pesanan").wait_for(timeout=15000)
                await shot(sp, "mobile", "14-kasir-empty-cart.png")
                await sp.locator("button").filter(has_text="Nasi Goreng").first.click()
                await sp.get_by_text("Total", exact=True).wait_for()
                ck(await sp.get_by_text("Nasi Goreng").count() > 0, "item tidak masuk cart kasir")
                await shot(sp, "mobile", "15-kasir-with-cart.png")
                await sp.get_by_placeholder("Nama customer").fill(CASH_M)
                await sp.get_by_placeholder("Nomor meja").fill("Meja 3")
                await sp.get_by_role("button", name="Buat pesanan + cetak struk").click()
                await sp.get_by_text("Print ulang struk").wait_for(timeout=15000)
                ck(await sp.locator("#receipt-print-area").count() == 1, "area struk tidak ada")
                await shot(sp, "mobile", "16-kasir-last-order.png")
                await sp.emulate_media(media="print")
                await sp.wait_for_timeout(400)
                ck(await sp.locator("#receipt-print-area").is_visible(), "struk tidak terlihat saat print")
                struk = await sp.locator("#receipt-print-area").inner_text()
                ck("TOTAL" in struk and "Nasi Goreng" in struk, "isi struk tidak lengkap")
                await shot(sp, "mobile", "17-print-preview-struk.png", full_page=False)
                await sp.emulate_media(media="screen")

            async def b08() -> None:
                sp = st["sp"]
                st["cur"], st["folder"] = sp, "mobile"
                await sp.get_by_role("button", name="Menu", exact=True).click()
                await sp.get_by_text("menu terdaftar").wait_for(timeout=15000)
                ck(await sp.get_by_text("11 menu terdaftar").count() > 0, "jumlah menu seller != 11")
                await shot(sp, "mobile", "18-dashboard-menu-tab.png")
                await sp.get_by_role("button", name="QR Meja", exact=True).click()
                await sp.get_by_text("Generate QR code meja").wait_for(timeout=15000)
                await sp.locator('img[alt="QR Meja 1"]').first.wait_for(timeout=15000)
                await sp.wait_for_timeout(2000)
                loaded = await sp.evaluate(
                    "() => { const i = document.querySelector('img[alt=\"QR Meja 1\"]');"
                    " return !!(i && i.complete && i.naturalWidth > 0); }"
                )
                ck(loaded, "gambar QR tidak termuat")
                await shot(sp, "mobile", "19-dashboard-qr-tab.png")
                await sp.emulate_media(media="print")
                await sp.wait_for_timeout(400)
                ck(await sp.locator("#qr-print-area").is_visible(), "area print QR tidak terlihat")
                await shot(sp, "mobile", "20-print-preview-qr.png", full_page=False)
                await sp.emulate_media(media="screen")
                await sp.get_by_role("button", name="Pengaturan", exact=True).click()
                await sp.get_by_text("Ukuran printer thermal").wait_for(timeout=15000)
                await shot(sp, "mobile", "21-dashboard-settings.png")

            async def b09() -> None:
                sp = st["sp"]
                st["cur"], st["folder"] = sp, "desktop"
                await sp.set_viewport_size(DESKTOP)
                await sp.get_by_role("button", name="Orders", exact=True).click()
                await sp.get_by_text("Total hari ini").wait_for(timeout=15000)
                await shot(sp, "desktop", "13-dashboard-orders.png")
                await sp.get_by_role("button", name="Kasir", exact=True).click()
                await sp.get_by_text("Tap menu untuk menambahkan pesanan").wait_for(timeout=15000)
                await shot(sp, "desktop", "14-kasir-empty-cart.png")
                await sp.locator("button").filter(has_text="Mie Goreng").first.click()
                await shot(sp, "desktop", "15-kasir-with-cart.png")
                await sp.get_by_placeholder("Nama customer").fill(CASH_D)
                await sp.get_by_role("button", name="Buat pesanan + cetak struk").click()
                await sp.get_by_text("Print ulang struk").wait_for(timeout=15000)
                await shot(sp, "desktop", "16-kasir-last-order.png")
                await sp.emulate_media(media="print")
                await sp.wait_for_timeout(400)
                ck(await sp.locator("#receipt-print-area").is_visible(), "struk desktop tidak terlihat")
                await shot(sp, "desktop", "17-print-preview-struk.png", full_page=False)
                await sp.emulate_media(media="screen")
                await sp.get_by_role("button", name="Menu", exact=True).click()
                await sp.get_by_text("menu terdaftar").wait_for(timeout=15000)
                await shot(sp, "desktop", "18-dashboard-menu-tab.png")
                await sp.get_by_role("button", name="QR Meja", exact=True).click()
                await sp.get_by_text("Generate QR code meja").wait_for(timeout=15000)
                await sp.wait_for_timeout(2000)
                await shot(sp, "desktop", "19-dashboard-qr-tab.png")
                await sp.emulate_media(media="print")
                await sp.wait_for_timeout(400)
                await shot(sp, "desktop", "20-print-preview-qr.png", full_page=False)
                await sp.emulate_media(media="screen")
                await sp.get_by_role("button", name="Pengaturan", exact=True).click()
                await sp.get_by_text("Ukuran printer thermal").wait_for(timeout=15000)
                await shot(sp, "desktop", "21-dashboard-settings.png")

            async def c01() -> None:
                ac = await browser.new_context(viewport=MOBILE, device_scale_factor=DSF)
                await ac.add_init_script("window.print = function () {};")
                ap = await ac.new_page()
                ap.set_default_timeout(15000)
                st["admin"] = ac
                st["ap"] = ap
                st["cur"], st["folder"] = ap, "mobile"
                await login(ap, ADMIN_EMAIL, ADMIN_PW, "/admin")
                await ap.get_by_text("Daftar restoran").wait_for(timeout=15000)
                # Judul bisa muncul sebelum kartu selesai dirender → tunggu dulu
                # (count() tanpa wait = race, pernah gagal di run ke-3).
                try:
                    await ap.get_by_text("/r/kantin-demo").first.wait_for(timeout=15000)
                except Exception:  # noqa: BLE001
                    pass
                ck(await ap.get_by_text("/r/kantin-demo").count() > 0, "kantin-demo tidak ada di daftar admin")
                cards = ap.locator('div[class*="md:hidden"] > div')
                n = await cards.count()
                ck(n >= 2, f"daftar resto admin = {n}, expect >= 2 (kantin-demo + warung-contoh)")
                await shot(ap, "mobile", "22-admin-panel.png")

            async def c02() -> None:
                ap = st["ap"]
                st["cur"], st["folder"] = ap, "mobile"
                sw = ap.get_by_role("switch", name=re.compile("Kantin Demo"))
                await sw.wait_for(timeout=10000)
                ck(await sw.get_attribute("aria-checked") == "true", "status awal kantin-demo bukan Buka")
                await sw.click()
                await ap.wait_for_function(
                    "() => { const s = document.querySelector('[role=switch][aria-label*=\"Kantin Demo\"]');"
                    " return s && s.getAttribute('aria-checked') === 'false'; }",
                    timeout=10000,
                )
                await shot(ap, "mobile", "33-admin-toggle-closed.png")
                await wait_resto_open(False)
                await ap.reload(wait_until="domcontentloaded")
                sw = ap.get_by_role("switch", name=re.compile("Kantin Demo"))
                await sw.wait_for(timeout=10000)
                ck(
                    await sw.get_attribute("aria-checked") == "false",
                    "toggle buka/tutup tidak persisten setelah reload",
                )
                await sw.click()
                await ap.wait_for_function(
                    "() => { const s = document.querySelector('[role=switch][aria-label*=\"Kantin Demo\"]');"
                    " return s && s.getAttribute('aria-checked') === 'true'; }",
                    timeout=10000,
                )
                await wait_resto_open(True)
                resto = http_json(f"{BE}/api/r/{SLUG}")
                ck(resto["is_open"] is True, "kantin-demo belum kembali Buka di backend")

            async def c03() -> None:
                ap = st["ap"]
                st["cur"], st["folder"] = ap, "mobile"
                await ap.get_by_role("button", name="+ Daftarkan resto").click()
                await ap.get_by_text("Daftarkan restoran baru").wait_for()
                ck(await ap.locator("input[placeholder='Warung Bu Siti']").count() == 1, "form resto tidak lengkap")
                await shot(ap, "mobile", "23-admin-create-form.png")
                await ap.get_by_role("button", name="Batal", exact=True).click()
                await ap.get_by_text("Daftarkan restoran baru").wait_for(state="detached")

            async def c04() -> None:
                ap = st["ap"]
                st["cur"], st["folder"] = ap, "desktop"
                await ap.set_viewport_size(DESKTOP)
                await ap.get_by_text("Daftar restoran").wait_for()
                await shot(ap, "desktop", "22-admin-panel.png")
                await ap.get_by_role("button", name="+ Daftarkan resto").click()
                await ap.get_by_text("Daftarkan restoran baru").wait_for()
                await shot(ap, "desktop", "23-admin-create-form.png")
                await ap.get_by_role("button", name="Batal", exact=True).click()

            async def d01() -> None:
                st["folder"] = "mobile"
                ap_page = await aux.new_page()
                ap_page.set_default_timeout(15000)
                st["cur"] = ap_page
                await ap_page.set_viewport_size(MOBILE)
                await audit_page(ap_page, "landing-mobile", FE + "/", "mobile")
                await audit_page(ap_page, "menu-mobile", f"{FE}/r/{SLUG}", "mobile")
                await ap_page.set_viewport_size(DESKTOP)
                await audit_page(ap_page, "landing-desktop", FE + "/", "desktop")
                await audit_page(ap_page, "menu-desktop", f"{FE}/r/{SLUG}", "desktop")

                sp = st["sp"]
                st["cur"] = sp
                await sp.set_viewport_size(MOBILE)
                await sp.get_by_role("button", name="Orders", exact=True).click()
                await sp.get_by_text("Total hari ini").wait_for(timeout=15000)
                await audit_page(sp, "dashboard-seller-mobile", None, "mobile")
                await sp.set_viewport_size(DESKTOP)
                await audit_page(sp, "dashboard-seller-desktop", None, "desktop")

                ap = st["ap"]
                st["cur"] = ap
                await ap.set_viewport_size(MOBILE)
                await audit_page(ap, "admin-mobile", None, "mobile")
                await ap.set_viewport_size(DESKTOP)
                await audit_page(ap, "admin-desktop", None, "desktop")

                await ap_page.close()

            plan: list[tuple[str, Callable[[], Awaitable[None]]]] = [
                ("A01-landing-mobile", a01),
                ("A02-landing-modal-mobile", a02),
                ("A03-demo-menu-mobile", a03),
                ("A04-menu-skeleton-mobile", a04),
                ("A05-login-cta-demo-mobile", a05),
                ("A06-category-filter-mobile", a06),
                ("A07-cart-add-mobile", a07),
                ("A08-cart-view-mobile", a08),
                ("A09-checkout-validation-mobile", a09),
                ("A10-checkout-filled-mobile", a10),
                ("A11-place-order-mobile", a11),
                ("A12-soft-exit-mobile", a12),
                ("A13-cancel-confirm-mobile", a13),
                ("A14-order-history-mobile", a14),
                ("A15-resto-404-mobile", a15),
                ("A16-network-error-mobile", a16),
                ("A17-landing-demo-desktop", a17),
                ("A18-category-filter-desktop", a18),
                ("A19-order-desktop", a19),
                ("A20-login-cta-demo-desktop", a20),
                ("B01-seller-login", b01),
                ("B02-orders-new-mobile", b02),
                ("B03-status-preparing-mobile", b03),
                ("B04-customer-sees-preparing-desktop", b04),
                ("B05-status-to-done-mobile", b05),
                ("B06-customer-pesan-lagi-desktop", b06),
                ("B07-kasir-mobile", b07),
                ("B08-seller-tabs-mobile", b08),
                ("B09-seller-desktop", b09),
                ("C01-admin-login-mobile", c01),
                ("C02-toggle-buka-tutup-mobile", c02),
                ("C03-create-form-mobile", c03),
                ("C04-admin-desktop", c04),
                ("D01-audit-contrast-overflow", d01),
            ]
            for label, fn in plan:
                await run(label, st, fn)
        finally:
            await browser.close()

    try:
        resto = http_json(f"{BE}/api/r/{SLUG}")
        if resto.get("is_open") is not True:
            print(f"PERINGATAN: {SLUG} is_open={resto.get('is_open')} setelah run!")
            RESULTS.append(["Z01-demo-harus-buka", "FAILED", f"is_open={resto.get('is_open')}"])
        else:
            RESULTS.append(["Z01-demo-harus-buka", "PASSED", ""])
    except Exception as e:  # noqa: BLE001
        RESULTS.append(["Z01-demo-harus-buka", "FAILED", str(e)])

    paths = write_files_json()
    write_audit()

    passed = sum(1 for r in RESULTS if r[1] == "PASSED")
    failed = sum(1 for r in RESULTS if r[1] == "FAILED")
    print("\n=== RINGKASAN E2E KANTIN ===")
    for label, status, detail in RESULTS:
        print(f"  {status:6} {label}" + (f"  <- {detail}" if detail else ""))
    print(f"\nPASSED: {passed}  FAILED: {failed}  total: {len(RESULTS)}")
    print(f"files.json: {len(paths)} path ditulis")
    mobile_n = len(list((OUT / 'mobile').glob('*.png')))
    desktop_n = len(list((OUT / 'desktop').glob('*.png')))
    print(f"screenshot: mobile={mobile_n} desktop={desktop_n}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        sys.exit(130)
