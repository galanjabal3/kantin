// Satu sumber kebenaran untuk ukuran printer thermal (dipakai CashierTab +
// SettingsTab supaya default & lebar struk selalu konsisten).
export type PrinterSize = "58mm" | "80mm";

export const PRINTER_SIZES: PrinterSize[] = ["58mm", "80mm"];

export const DEFAULT_PRINTER_SIZE: PrinterSize = "58mm";

// Lebar konten struk dalam px — 58mm ≈ 280px, 80mm ≈ 340px
export const PRINTER_WIDTH_PX: Record<PrinterSize, number> = {
  "58mm": 280,
  "80mm": 340,
};

const STORAGE_KEY = "kantin-printer-size";

export function getPrinterSize(): PrinterSize {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "58mm" || stored === "80mm" ? stored : DEFAULT_PRINTER_SIZE;
}

export function setPrinterSize(size: PrinterSize): void {
  localStorage.setItem(STORAGE_KEY, size);
}

export function getReceiptWidthPx(): number {
  return PRINTER_WIDTH_PX[getPrinterSize()];
}
