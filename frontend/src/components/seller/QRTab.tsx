import { useState } from "react";

interface QRTabProps {
  token: string;
  slug: string;
  restaurantName: string;
}

export default function QRTab({ slug, restaurantName }: QRTabProps) {
  const [tableCount, setTableCount] = useState(10);
  const [baseUrl, setBaseUrl] = useState(window.location.origin);
  const [printTarget, setPrintTarget] = useState<number | null>(null);

  const tables = Array.from({ length: tableCount }, (_, i) => i + 1);

  const getQRUrl = (table: number, size = 200) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
      `${baseUrl}/r/${slug}?table=${table}`,
    )}`;

  const handlePrintAll = () => {
    setPrintTarget(null);
    setTimeout(() => window.print(), 300);
  };

  const handlePrintOne = (table: number) => {
    setPrintTarget(table);
    setTimeout(() => window.print(), 300);
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }

          #qr-print-area, #qr-print-area * { 
            visibility: visible; 
          }

          #qr-print-area {
            display: flex !important; /* ⬅️ INI WAJIB */
            position: fixed;
            inset: 0;
            flex-wrap: wrap;
            gap: 16px;
            padding: 20px;
            align-content: flex-start;
          }

          .qr-print-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            page-break-inside: avoid;
            width: 180px;
          }

          .qr-print-item.hidden-in-print {
            display: none !important;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="flex flex-col gap-6">
        {/* Controls */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 no-print">
          <p className="text-sm font-medium text-gray-900 mb-4">
            Generate QR code meja
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-500 font-medium">
                Jumlah meja
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={tableCount}
                onChange={(e) =>
                  setTableCount(
                    Math.max(1, Math.min(100, Number(e.target.value))),
                  )
                }
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-500 font-medium">
                Base URL
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 font-mono">
              {baseUrl}/r/{slug}?table=N
            </p>
            <button
              onClick={handlePrintAll}
              className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Print semua QR
            </button>
          </div>
        </div>

        {/* QR Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 no-print">
          {tables.map((table) => (
            <div
              key={table}
              className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col items-center gap-3 group hover:border-brand-300 transition-colors"
            >
              <img
                src={getQRUrl(table, 160)}
                alt={`QR Meja ${table}`}
                className="w-28 h-28"
              />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900">
                  Meja {table}
                </p>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  ?table={table}
                </p>
              </div>
              <button
                onClick={() => handlePrintOne(table)}
                className="w-full text-xs border border-gray-200 hover:border-brand-400 hover:text-brand-500 text-gray-500 py-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
              >
                Print meja ini
              </button>
            </div>
          ))}
        </div>

        {/* Print area — hidden di screen, visible saat print */}
        <div id="qr-print-area" style={{ display: "none" }}>
          {tables.map((table) => (
            <div
              key={table}
              className={`qr-print-item ${
                printTarget !== null && printTarget !== table
                  ? "hidden-in-print"
                  : ""
              }`}
            >
              <img
                src={getQRUrl(table, 200)}
                alt={`QR Meja ${table}`}
                width={160}
                height={160}
              />
              <p
                style={{
                  fontWeight: "bold",
                  marginTop: "8px",
                  fontSize: "13px",
                }}
              >
                {restaurantName}
              </p>
              <p
                style={{
                  fontSize: "16px",
                  fontWeight: "bold",
                  margin: "4px 0",
                }}
              >
                Meja {table}
              </p>
              <p style={{ fontSize: "10px", color: "#888" }}>
                {baseUrl}/r/{slug}
              </p>
              <p style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                Scan untuk pesan
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
