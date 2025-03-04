
import { useRef, useEffect } from 'react';

const partners = [
  { id: 1, name: "Blackstone Real Estate", logo: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=120&h=60&fit=crop" },
  { id: 2, name: "Morgan Stanley", logo: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=120&h=60&fit=crop" },
  { id: 3, name: "Goldman Properties", logo: "https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=120&h=60&fit=crop" },
  { id: 4, name: "Brookfield Asset Management", logo: "https://images.unsplash.com/photo-1588702547919-26089e690ecc?w=120&h=60&fit=crop" },
  { id: 5, name: "CBRE Group", logo: "https://images.unsplash.com/photo-1586880244406-556ebe35f282?w=120&h=60&fit=crop" },
  { id: 6, name: "Jones Lang LaSalle", logo: "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=120&h=60&fit=crop" },
  { id: 7, name: "Prologis", logo: "https://images.unsplash.com/photo-1608222351212-18fe0ec7b13b?w=120&h=60&fit=crop" },
];

export const PartnerLogos = () => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const scrollWidth = scrollContainer.scrollWidth;
    const clientWidth = scrollContainer.clientWidth;
    
    if (scrollWidth <= clientWidth) return;
    
    let scrollPosition = 0;
    const scrollSpeed = 0.5;

    const scroll = () => {
      scrollPosition += scrollSpeed;
      
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
  }, []);

  return (
    <div className="bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Trusted by Industry Leaders</h2>
        </div>
        
        <div className="relative max-w-5xl mx-auto overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-gray-50 to-transparent z-10"></div>
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-gray-50 to-transparent z-10"></div>
          
          <div 
            ref={scrollRef}
            className="flex items-center gap-12 py-4 overflow-x-scroll no-scrollbar"
          >
            {/* Double the logos for infinite scroll effect */}
            {[...partners, ...partners].map((partner, index) => (
              <div 
                key={`${partner.id}-${index}`} 
                className="flex-shrink-0 flex flex-col items-center"
              >
                <div className="bg-white p-4 rounded-lg shadow-sm w-32 h-20 flex items-center justify-center">
                  <img 
                    src={partner.logo} 
                    alt={partner.name} 
                    className="max-w-full max-h-full object-contain" 
                  />
                </div>
                <span className="text-xs text-gray-500 mt-2">{partner.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
