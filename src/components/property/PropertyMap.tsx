
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
    
    // Create an iframe with Google Maps embed
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '8px';
    
    // Construct Google Maps URL with the property's coordinates
    const mapUrl = `https://www.google.com/maps/embed/v1/place?key=AIzaSyBMH_1rAIGlRlTtSI_WLPi5ied8TmaFoKM&q=${lat},${lng}&zoom=15`;
    
    iframe.src = mapUrl;
    iframe.title = `Map showing location of property at ${location}`;
    iframe.allow = "fullscreen";
    
    // Add a backup in case iframe doesn't load or API key issues
    iframe.onerror = () => {
      if (mapRef.current) {
        // Create a fallback static map image
        const fallbackMap = document.createElement('div');
        fallbackMap.style.width = '100%';
        fallbackMap.style.height = '100%';
        fallbackMap.style.backgroundImage = `url("https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-s+ff4757(${lng},${lat})/${lng},${lat},14,0/600x400@2x?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4M29iazA2Z2gycXA4N2pmbDZmangifQ.-g_vE53SD2WrJ6tFX7QHmA")`;
        fallbackMap.style.backgroundSize = 'cover';
        fallbackMap.style.backgroundPosition = 'center';
        fallbackMap.style.borderRadius = '8px';
        
        // Add location label
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
        
        mapRef.current.appendChild(fallbackMap);
        mapRef.current.appendChild(locationLabel);
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
