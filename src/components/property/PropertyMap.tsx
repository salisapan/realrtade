
import { useEffect, useRef } from 'react';

interface PropertyMapProps {
  location: string;
  lat?: number;
  lng?: number;
}

export const PropertyMap = ({ location, lat = 40.7128, lng = -74.0060 }: PropertyMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Clean up any previous map content
    mapRef.current.innerHTML = '';
    
    // Create an iframe with OpenStreetMap embed
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '8px';
    
    // Use OpenStreetMap instead of Google Maps
    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.01},${lat-0.01},${lng+0.01},${lat+0.01}&layer=mapnik&marker=${lat},${lng}`;
    
    iframe.src = mapUrl;
    iframe.title = `Map showing location of property at ${location}`;
    iframe.allow = "fullscreen";
    
    // Add fallback in case iframe doesn't load
    iframe.onerror = () => {
      if (mapRef.current) {
        const fallbackDiv = document.createElement('div');
        fallbackDiv.className = "flex flex-col items-center justify-center h-full";
        fallbackDiv.innerHTML = `
          <p class="text-gray-500">Map could not be loaded</p>
          <p class="text-sm text-gray-400">${location}</p>
          <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}" 
             target="_blank" 
             class="text-primary text-sm mt-2">
            View on OpenStreetMap
          </a>
        `;
        mapRef.current.appendChild(fallbackDiv);
      }
    };
    
    // Append the iframe to the map container
    mapRef.current.appendChild(iframe);
    
    // Add location label over the map
    const locationLabel = document.createElement('div');
    locationLabel.textContent = location;
    locationLabel.style.position = 'absolute';
    locationLabel.style.bottom = '10px';
    locationLabel.style.left = '10px';
    locationLabel.style.backgroundColor = 'white';
    locationLabel.style.padding = '5px 10px';
    locationLabel.style.borderRadius = '4px';
    locationLabel.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    locationLabel.style.fontSize = '14px';
    locationLabel.style.fontWeight = 'bold';
    locationLabel.style.zIndex = '1';
    
    mapRef.current.appendChild(locationLabel);
    
  }, [location, lat, lng]);
  
  return (
    <div 
      ref={mapRef}
      className="w-full h-64 bg-gray-100 rounded-lg shadow-sm relative"
      aria-label={`Map showing location of property at ${location}`}
    ></div>
  );
};
