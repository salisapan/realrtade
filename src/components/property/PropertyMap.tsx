
import { useEffect, useRef } from 'react';

interface PropertyMapProps {
  location: string;
  lat?: number;
  lng?: number;
}

export const PropertyMap = ({ location, lat = 40.7128, lng = -74.0060 }: PropertyMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // This is a placeholder for a real map integration
    // In a real implementation, you would use Google Maps or Mapbox
    if (mapRef.current) {
      const mapContainer = mapRef.current;
      
      // Create a colored div with location text to simulate a map
      mapContainer.innerHTML = '';
      mapContainer.style.position = 'relative';
      mapContainer.style.overflow = 'hidden';
      mapContainer.style.borderRadius = '8px';
      
      const mapContent = document.createElement('div');
      mapContent.style.width = '100%';
      mapContent.style.height = '100%';
      mapContent.style.backgroundColor = '#e9ecef';
      mapContent.style.display = 'flex';
      mapContent.style.alignItems = 'center';
      mapContent.style.justifyContent = 'center';
      mapContent.style.padding = '1rem';
      
      const locationText = document.createElement('div');
      locationText.textContent = `📍 ${location}`;
      locationText.style.backgroundColor = 'white';
      locationText.style.padding = '0.5rem 1rem';
      locationText.style.borderRadius = '4px';
      locationText.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      locationText.style.fontWeight = '500';
      
      mapContent.appendChild(locationText);
      mapContainer.appendChild(mapContent);
      
      // Add a note about using real maps in production
      const disclaimer = document.createElement('div');
      disclaimer.textContent = 'Note: In production, this would be an interactive Google Map or Mapbox map.';
      disclaimer.style.position = 'absolute';
      disclaimer.style.bottom = '10px';
      disclaimer.style.left = '10px';
      disclaimer.style.right = '10px';
      disclaimer.style.backgroundColor = 'rgba(255,255,255,0.8)';
      disclaimer.style.padding = '4px 8px';
      disclaimer.style.borderRadius = '4px';
      disclaimer.style.fontSize = '10px';
      disclaimer.style.textAlign = 'center';
      
      mapContainer.appendChild(disclaimer);
    }
  }, [location, lat, lng]);
  
  return (
    <div 
      ref={mapRef}
      className="w-full h-64 bg-gray-100 rounded-lg shadow-sm"
    ></div>
  );
};
