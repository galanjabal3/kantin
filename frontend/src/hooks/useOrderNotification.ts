import { useEffect, useRef } from "react";

export function useOrderNotification(orders: any[], isReady: boolean) {
  const prevOrderIds = useRef<Set<string>>(new Set());
  const isFirst = useRef(true);

  // Request permission saat pertama kali
  useEffect(() => {
    if (!isReady) return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [isReady]);

  useEffect(() => {
    if (!isReady || orders.length === 0) return;

    // Skip notifikasi saat pertama load
    if (isFirst.current) {
      orders.forEach((o) => prevOrderIds.current.add(o.id));
      isFirst.current = false;
      return;
    }

    // Cek order baru yang belum ada sebelumnya
    orders.forEach((order) => {
      if (!prevOrderIds.current.has(order.id) && order.status === "pending") {
        prevOrderIds.current.add(order.id);
        triggerNotification(order);
      }
    });
  }, [orders, isReady]);
}

function triggerNotification(order: any) {
  if (Notification.permission !== "granted") return;

  const title = "🔔 Pesanan baru masuk!";
  const body = `${order.customer_name || "Tanpa nama"} — ${new Intl.NumberFormat(
    "id-ID",
    {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    },
  ).format(order.total_price)}`;

  const notif = new Notification(title, {
    body,
    icon: "/logo.svg",
    badge: "/logo.svg",
    tag: order.id, // prevent duplicate notif untuk order yang sama
  });

  // Auto close setelah 5 detik
  setTimeout(() => notif.close(), 5000);

  // Klik notif → fokus ke tab dashboard
  notif.onclick = () => {
    window.focus();
    notif.close();
  };
}
