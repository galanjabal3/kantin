import type { LucideIcon } from "lucide-react";
import { BarChart3, UtensilsCrossed } from "lucide-react";

export const WA_NUMBER = import.meta.env.VITE_ADMIN_WHATSAPP || "6281234567890";

export const WA_MESSAGES = {
  register:
    "Halo, saya ingin mendaftarkan restoran saya di Kantin. Mohon info lebih lanjut.",
  demo: "Halo, saya tertarik mencoba akun demo dashboard penjual Kantin. Mohon info lebih lanjut.",
} as const;

export type WaModalContent = {
  icon: LucideIcon;
  title: string;
  desc: string;
  message: string;
};

export function waLink(message: string): string {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const REGISTER_MODAL: WaModalContent = {
  icon: UtensilsCrossed,
  title: "Daftarkan restoranmu",
  desc: "Pendaftaran resto dilakukan melalui admin Kantin. Hubungi kami via WhatsApp di bawah ini.",
  message: WA_MESSAGES.register,
};

export const DEMO_MODAL: WaModalContent = {
  icon: BarChart3,
  title: "Minta akun demo",
  desc: "Akses akun demo dashboard penjual tidak dibagikan publik. Hubungi kami via WhatsApp, nanti kami kirimkan kredensialnya.",
  message: WA_MESSAGES.demo,
};
