export const formatSmartTime = (dateStr: string) => {
  // Force parse sebagai UTC kalau tidak ada timezone info
  const normalized =
    dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z";

  const date = new Date(normalized);
  const now = new Date();

  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return "Baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  if (diffHour < 24) return `${diffHour} jam lalu`;

  const time = date
    .toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    .replace(":", ".");

  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return `Hari ini ${time}`;

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Kemarin ${time}`;
  }

  const day = date.toLocaleDateString("id-ID", { weekday: "long" });
  return `${day} ${time}`;
};

export const isToday = (dateStr: string) => {
  const normalized =
    dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z";
  const date = new Date(normalized);
  const now = new Date();
  return date.toDateString() === now.toDateString();
};
