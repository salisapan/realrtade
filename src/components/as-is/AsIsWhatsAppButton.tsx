import { company } from "@/data/as-is-content";
import { trackAsIsEvent } from "./useAsIsAnalytics";

export default function AsIsWhatsAppButton() {
  const text = encodeURIComponent("היי, אני מעוניין/ת לבדוק התכנות התחדשות עירונית לבניין שלי");
  return (
    <a
      href={`https://wa.me/${company.whatsapp}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      className="asis-whatsapp-btn"
      title="דברו איתנו בוואטסאפ"
      aria-label="דברו איתנו בוואטסאפ"
      onClick={() => trackAsIsEvent("whatsapp_click")}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.44 1.32 4.94L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.02c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.8-.12-.42-.13-.95-.31-1.63-.6-2.87-1.24-4.74-4.15-4.88-4.34-.14-.19-1.17-1.56-1.17-2.98s.75-2.11 1.02-2.4c.27-.29.58-.36.78-.36l.55.01c.18 0 .42-.07.65.5.24.58.82 2 .89 2.15.07.15.12.32.02.51-.1.19-.15.31-.29.48-.14.17-.3.37-.43.5-.14.14-.29.29-.13.57.17.29.75 1.24 1.61 2 1.11.99 2.04 1.3 2.33 1.44.29.14.46.12.63-.07.17-.19.72-.84.92-1.13.19-.29.39-.24.65-.14.27.1 1.68.79 1.97.94.29.14.48.22.55.34.07.12.07.68-.17 1.36Z" />
      </svg>
    </a>
  );
}
