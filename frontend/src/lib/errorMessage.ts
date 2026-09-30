// Ambil pesan error dari unknown tanpa memakai `any`
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
