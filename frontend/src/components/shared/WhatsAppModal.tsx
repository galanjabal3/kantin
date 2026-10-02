import { waLink, type WaModalContent } from "../../lib/whatsapp";

type Props = {
  content: WaModalContent;
  onClose: () => void;
};

export default function WhatsAppModal({ content, onClose }: Props) {
  const Icon = content.icon;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center mb-4">
          <Icon className="w-6 h-6 text-brand-600" />
        </div>
        <h2
          className="text-xl text-gray-900 mb-2"
          style={{ fontFamily: "Playfair Display, serif" }}
        >
          {content.title}
        </h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          {content.desc}
        </p>
        <div className="flex flex-col gap-3">
          <a
            href={waLink(content.message)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-green-700 hover:bg-green-800 text-white text-sm font-medium py-3 rounded-xl text-center transition-colors flex items-center justify-center gap-2"
          >
            Hubungi via WhatsApp
          </a>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-3 text-xs text-gray-500 hover:text-gray-600 py-2 transition-colors"
        >
          Tutup
        </button>
      </div>
    </div>
  );
}
