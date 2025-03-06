
import { useRef, useEffect } from 'react';

const partners = [
  { id: 1, name: "Blackstone", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Blackstone_Group_logo.svg/320px-Blackstone_Group_logo.svg.png" },
  { id: 2, name: "CBRE Group", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/CBRE_Group_logo.svg/320px-CBRE_Group_logo.svg.png" },
  { id: 3, name: "JLL", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/JLL_logo.svg/320px-JLL_logo.svg.png" },
  { id: 4, name: "Goldman Sachs", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Goldman_Sachs.svg/320px-Goldman_Sachs.svg.png" },
  { id: 5, name: "JPMorgan", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/J.P._Morgan_Logo_2008_1.svg/320px-J.P._Morgan_Logo_2008_1.svg.png" },
  { id: 6, name: "Carlyle Group", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/The_Carlyle_Group_logo.svg/320px-The_Carlyle_Group_logo.svg.png" },
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
                <div className="bg-white p-6 rounded-lg shadow-sm w-36 h-24 flex items-center justify-center">
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
