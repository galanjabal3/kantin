import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";

// Palet pastel senada brand (oranye/krem/hijau/merah muda) — dipilih
// deterministik dari hash nama item supaya menu yang sama selalu tampil
// dengan warna yang sama di semua halaman (customer, kasir, menu).
const PALETTES: ReadonlyArray<{ from: string; to: string; ink: string }> = [
  { from: "#FFF1E3", to: "#FFDCC0", ink: "#C2410C" }, // oranye lembut
  { from: "#FDF7E9", to: "#F6E7C4", ink: "#9A3412" }, // krem
  { from: "#EAF6EE", to: "#CFE9D9", ink: "#15803D" }, // hijau lembut
  { from: "#FDEDF0", to: "#F7D6DD", ink: "#BE123C" }, // merah muda lembut
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickPalette(name: string) {
  return PALETTES[hashName(name) % PALETTES.length];
}

interface MenuImageProps {
  /** Nama item — sumber deterministik untuk warna placeholder */
  name: string;
  /** URL foto dari server; kosong/ gagal → placeholder */
  imageUrl?: string | null;
  /** Ukuran & radius kotak (mis. "w-20 h-20 rounded-lg") */
  className?: string;
}

export default function MenuImage({
  name,
  imageUrl,
  className = "",
}: MenuImageProps) {
  const [failed, setFailed] = useState(false);

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`object-cover bg-gray-100 ${className}`}
      />
    );
  }

  const palette = pickPalette(name);

  return (
    <div
      role="img"
      aria-label={`Foto ${name}`}
      className={`relative overflow-hidden ${className}`}
      style={{
        backgroundImage: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)`,
      }}
    >
      <UtensilsCrossed
        aria-hidden="true"
        strokeWidth={1.5}
        className="absolute left-1/2 top-1/2 w-[46%] h-[46%] max-w-10 max-h-10 -translate-x-1/2 -translate-y-1/2"
        style={{ color: palette.ink }}
      />
    </div>
  );
}
