
import { useRef, useEffect, useState } from 'react';

const partners = [{
  id: 1,
  name: "Blackstone",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Blackstone_Group_logo.svg/320px-Blackstone_Group_logo.svg.png"
}, {
  id: 2,
  name: "CBRE Group",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/CBRE_Group_logo.svg/320px-CBRE_Group_logo.svg.png"
}, {
  id: 3,
  name: "JLL",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/JLL_logo.svg/320px-JLL_logo.svg.png"
}, {
  id: 4,
  name: "Goldman Sachs",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Goldman_Sachs.svg/320px-Goldman_Sachs.svg.png"
}, {
  id: 5,
  name: "JPMorgan",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/J.P._Morgan_Logo_2008_1.svg/320px-J.P._Morgan_Logo_2008_1.svg.png"
}, {
  id: 6,
  name: "Carlyle Group",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/The_Carlyle_Group_logo.svg/320px-The_Carlyle_Group_logo.svg.png"
}, {
  id: 7,
  name: "Outlook",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg/320px-Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg.png"
}, {
  id: 8,
  name: "Word",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Microsoft_Office_Word_%282019%E2%80%93present%29.svg/320px-Microsoft_Office_Word_%282019%E2%80%93present%29.svg.png"
}, {
  id: 9,
  name: "iManage",
  logo: "https://upload.wikimedia.org/wikipedia/en/thumb/d/d7/IManage_logo.svg/320px-IManage_logo.svg.png"
}];

export const PartnerLogos = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const scrollWidth = scrollContainer.scrollWidth;
    const clientWidth = scrollContainer.clientWidth;

    if (scrollWidth <= clientWidth) return;

    let scrollPosition = 0;
    const scrollSpeed = 0.5;

    const scroll = () => {
      // Pause animation when hovered
      if (!isHovered) {
        scrollPosition += scrollSpeed;
      }

      // Reset position when we've scrolled through the content once
      if (scrollPosition >= scrollWidth / 2) {
        scrollPosition = 0;
      }

      if (scrollContainer) {
        scrollContainer.scrollLeft = scrollPosition;
      }

      requestAnimationFrame(scroll);
    };

    const animationId = requestAnimationFrame(scroll);

    return () => cancelAnimationFrame(animationId);
  }, [isHovered]);
  
  return (
    <div className="bg-gray-50 py-8 md:py-12">
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .partner-card {
          animation: fadeInUp 0.6s ease-out forwards;
        }

        .partner-card:nth-child(1) { animation-delay: 0.1s; }
        .partner-card:nth-child(2) { animation-delay: 0.15s; }
        .partner-card:nth-child(3) { animation-delay: 0.2s; }
        .partner-card:nth-child(4) { animation-delay: 0.25s; }
        .partner-card:nth-child(5) { animation-delay: 0.3s; }
        .partner-card:nth-child(6) { animation-delay: 0.35s; }
        .partner-card:nth-child(7) { animation-delay: 0.4s; }
        .partner-card:nth-child(8) { animation-delay: 0.45s; }
        .partner-card:nth-child(9) { animation-delay: 0.5s; }

        .partner-logo-box {
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .partner-logo-box:hover {
          transform: translateY(-8px) scale(1.08);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
        }
      `}</style>
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-6 md:mb-8">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">Trusted by Industry Leaders</h2>
        </div>

        <div className="relative max-w-5xl mx-auto overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-8 md:w-16 bg-gradient-to-r from-gray-50 to-transparent z-10"></div>
          <div className="absolute right-0 top-0 bottom-0 w-8 md:w-16 bg-gradient-to-l from-gray-50 to-transparent z-10"></div>

          <div
            ref={scrollRef}
            className="flex items-center gap-6 md:gap-12 py-4 overflow-x-scroll no-scrollbar"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {/* Double the logos for infinite scroll effect */}
            {[...partners, ...partners].map((partner, index) => (
              <div
                key={`${partner.id}-${index}`}
                className="partner-card flex-shrink-0 flex flex-col items-center"
              >
                <div className="partner-logo-box bg-white p-4 md:p-6 rounded-lg shadow-sm w-24 h-20 md:w-36 md:h-24 flex items-center justify-center">
                  <img
                    src={partner.logo}
                    alt={partner.name}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <span className="text-xs text-gray-500 mt-2 font-medium">{partner.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
