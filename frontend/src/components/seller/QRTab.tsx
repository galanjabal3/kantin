import { useState, useRef } from "react";

interface QRTabProps {
  token: string;
  slug: string;
  restaurantName: string;
}

export default function QRTab({ token, slug, restaurantName }: QRTabProps) {
  const [tableCount, setTableCount] = useState(10);
  const [baseUrl, setBaseUrl] = useState(window.location.origin);
  const printRef = useRef<HTMLDivElement>(null);

  const tables = Array.from({ length: tableCount }, (_, i) => i + 1);

  const getQRUrl = (table: number) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      `${baseUrl}/r/${slug}?table=${table}`,
    )}`;

  const handlePrint = () => window.print();

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #qr-print-area, #qr-print-area * { visibility: visible; }
          #qr-print-area { position: fixed; inset: 0; padding: 20px; }
          .qr-item { display: inline-block; width: 200px; margin: 12px; text-align: center; page-break-inside: avoid; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex flex-col gap-6">
        {/* Controls */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 no-print">
          <p className="text-sm font-medium text-gray-900 mb-4">
            Generate QR code meja
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-500 font-medium">
                Jumlah meja
              </label>
              <input
                type="text"
                inputMode="numeric"
                min={1}
                max={100}
                value={tableCount}
                onChange={(e) => setTableCount(Number(e.target.value))}
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
          <div className="flex gap-3 mt-4">
            <button
              onClick={handlePrint}
              className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Print semua QR
            </button>
            <p className="text-xs text-gray-400 self-center">
              URL: {baseUrl}/r/{slug}?table=N
            </p>
          </div>
        </div>

        {/* QR Grid */}
        <div id="qr-print-area" ref={printRef}>
          {/* Print header */}
          <div className="hidden print:block text-center mb-6">
            <p className="text-lg font-bold">{restaurantName}</p>
            <p className="text-sm text-gray-500">QR Code Meja</p>
          </div>

          <div className="grid grid-cols-4 gap-4 no-print">
            {tables.map((table) => (
              <div
                key={table}
                className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col items-center gap-3"
              >
                <img
                  src={getQRUrl(table)}
                  alt={`QR Meja ${table}`}
                  className="w-32 h-32"
                />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-900">
                    Meja {table}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono truncate max-w-30">
                    ?table={table}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Print layout */}
          <div className="hidden print:block">
            {tables.map((table) => (
              <div key={table} className="qr-item">
                <img
                  src={getQRUrl(table)}
                  alt={`QR Meja ${table}`}
                  width={160}
                  height={160}
                />
                <p style={{ fontWeight: "bold", marginTop: "8px" }}>
                  {restaurantName}
                </p>
                <p style={{ fontSize: "18px", fontWeight: "bold" }}>
                  Meja {table}
                </p>
                <p style={{ fontSize: "10px", color: "#666" }}>
                  Scan untuk pesan
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
