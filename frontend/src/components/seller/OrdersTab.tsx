import { useEffect, useState, useCallback } from "react";
import { getSellerOrders, updateOrderStatus } from "../../lib/api";
import { formatSmartTime, isToday } from "../../utils/formatTime";

interface OrderItem {
  id: string;
  quantity: number;
  subtotal: number;
  menu_item_id: string;
}

interface Order {
  id: string;
  customer_name: string;
  table_number: string | null;
  total_price: number;
  status: string;
  source: string;
  created_at: string;
  items: OrderItem[];
}

const STATUS_FLOW: Record<string, string> = {
  pending: "preparing",
  preparing: "ready",
  ready: "done",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  preparing: "Diproses",
  ready: "Siap",
  done: "Selesai",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-600",
  preparing: "bg-blue-50 text-blue-600",
  ready: "bg-green-50 text-green-600",
  done: "bg-gray-100 text-gray-500",
};

const SOURCE_LABEL: Record<string, string> = {
  customer: "Customer",
  cashier: "Kasir",
};

const SOURCE_COLOR: Record<string, string> = {
  customer: "bg-blue-50 text-blue-500",
  cashier: "bg-amber-50 text-amber-600",
};

export default function OrdersTab({ token }: { token: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOldOrders, setShowOldOrders] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await getSellerOrders(token);
      setOrders(data);
    } catch {
      // silent fail on refetch
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOrders();
    // Auto refresh every 15 seconds
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      await updateOrderStatus(token, orderId, newStatus);
      fetchOrders();
    } catch {
      alert("Gagal mengupdate status");
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);

  if (loading)
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        Memuat orders...
      </div>
    );

  const todayOrders = orders.filter((o) => isToday(o.created_at));
  const activeOrders = orders.filter((o) => o.status !== "done");
  const doneOrders = orders
    .filter((o) => o.status === "done" && isToday(o.created_at)) // ← tambah isToday
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const oldDoneOrders = orders
    .filter((o) => o.status === "done" && !isToday(o.created_at))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total hari ini", value: todayOrders.length },
          {
            label: "Pending",
            value: todayOrders.filter((o) => o.status === "pending").length,
          },
          {
            label: "Diproses",
            value: todayOrders.filter((o) => o.status === "preparing").length,
          },
          {
            label: "Siap",
            value: todayOrders.filter((o) => o.status === "ready").length,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white border border-gray-100 rounded-xl p-4"
          >
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className="text-2xl font-medium text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Active orders */}
      {activeOrders.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl py-12 text-center text-gray-400 text-sm">
          Tidak ada order aktif
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {activeOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white border border-gray-100 rounded-xl p-5 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">
                      {order.customer_name || "Tanpa nama"}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${SOURCE_COLOR[order.source]}`}
                    >
                      {SOURCE_LABEL[order.source]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
                    <span>
                      {order.items.length} item ·{" "}
                      {formatPrice(order.total_price)} ·{" "}
                      {formatSmartTime(order.created_at)}
                    </span>
                    {order.table_number && (
                      <span className="bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full text-xs font-medium">
                        {order.table_number}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_COLOR[order.status]}`}
                >
                  {STATUS_LABEL[order.status]}
                </span>
                {STATUS_FLOW[order.status] && (
                  <button
                    onClick={() =>
                      handleUpdateStatus(order.id, STATUS_FLOW[order.status])
                    }
                    className="text-sm bg-brand-500 hover:bg-brand-600 text-white px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {order.status === "pending"
                      ? "Proses"
                      : order.status === "preparing"
                        ? "Siap"
                        : "Selesai"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Done orders */}
      {doneOrders.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 font-medium mb-3 uppercase tracking-wide">
            Selesai hari ini
          </p>

          <div className="flex flex-col gap-2">
            {doneOrders.map((order) => (
              <div
                key={order.id}
                className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between"
              >
                {/* LEFT */}
                <div className="flex flex-col">
                  <span className="text-sm text-gray-700 font-medium">
                    {order.customer_name || "Tanpa nama"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatPrice(order.total_price)}
                  </span>
                </div>

                {/* RIGHT */}
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {formatSmartTime(order.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {oldDoneOrders.length > 0 && (
        <div>
          <button
            onClick={() => setShowOldOrders((prev) => !prev)}
            className="flex items-center gap-2 text-xs text-gray-400 font-medium uppercase tracking-wide mb-3 hover:text-gray-600 transition-colors"
          >
            <span>Sebelumnya ({oldDoneOrders.length})</span>
            <span
              className={`transition-transform ${showOldOrders ? "rotate-180" : ""}`}
            >
              ▾
            </span>
          </button>

          {showOldOrders && (
            <div className="flex flex-col gap-2">
              {oldDoneOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-700 font-medium">
                      {order.customer_name || "Tanpa nama"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatPrice(order.total_price)}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {formatSmartTime(order.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
