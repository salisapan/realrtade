
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
      
      // Add a grid overlay to simulate a map
      const grid = document.createElement('div');
      grid.style.position = 'absolute';
      grid.style.top = '0';
      grid.style.left = '0';
      grid.style.right = '0';
      grid.style.bottom = '0';
      grid.style.backgroundImage = 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)';
      grid.style.backgroundSize = '20px 20px';
      grid.style.pointerEvents = 'none';
      
      // Create a "map pin" for the location
      const locationPin = document.createElement('div');
      locationPin.style.position = 'absolute';
      locationPin.style.top = '50%';
      locationPin.style.left = '50%';
      locationPin.style.width = '20px';
      locationPin.style.height = '20px';
      locationPin.style.transform = 'translate(-50%, -100%)';
      locationPin.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="css-i6dzq1">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
      `;
      locationPin.style.color = '#ff4757';
      
      const locationText = document.createElement('div');
      locationText.textContent = location;
      locationText.style.backgroundColor = 'white';
      locationText.style.padding = '0.5rem 1rem';
      locationText.style.borderRadius = '4px';
      locationText.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      locationText.style.fontWeight = '500';
      locationText.style.maxWidth = '80%';
      locationText.style.wordBreak = 'break-word';
      
      // Add zoom control buttons
      const zoomControls = document.createElement('div');
      zoomControls.style.position = 'absolute';
      zoomControls.style.top = '10px';
      zoomControls.style.right = '10px';
      zoomControls.style.display = 'flex';
      zoomControls.style.flexDirection = 'column';
      zoomControls.style.gap = '5px';
      
      const zoomIn = document.createElement('button');
      zoomIn.textContent = '+';
      zoomIn.style.width = '30px';
      zoomIn.style.height = '30px';
      zoomIn.style.backgroundColor = 'white';
      zoomIn.style.border = 'none';
      zoomIn.style.borderRadius = '4px';
      zoomIn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      zoomIn.style.cursor = 'pointer';
      zoomIn.style.fontWeight = 'bold';
      
      const zoomOut = document.createElement('button');
      zoomOut.textContent = '-';
      zoomOut.style.width = '30px';
      zoomOut.style.height = '30px';
      zoomOut.style.backgroundColor = 'white';
      zoomOut.style.border = 'none';
      zoomOut.style.borderRadius = '4px';
      zoomOut.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      zoomOut.style.cursor = 'pointer';
      zoomOut.style.fontWeight = 'bold';
      
      zoomControls.appendChild(zoomIn);
      zoomControls.appendChild(zoomOut);
      
      // Add interactivity to zoom buttons
      zoomIn.addEventListener('click', () => {
        mapContent.style.transform = 'scale(1.2)';
        mapContent.style.transition = 'transform 0.3s ease';
      });
      
      zoomOut.addEventListener('click', () => {
        mapContent.style.transform = 'scale(1)';
        mapContent.style.transition = 'transform 0.3s ease';
      });
      
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
      
      mapContent.appendChild(grid);
      mapContent.appendChild(locationPin);
      mapContent.appendChild(locationText);
      mapContainer.appendChild(mapContent);
      mapContainer.appendChild(zoomControls);
      mapContainer.appendChild(disclaimer);
    }
  }, [location, lat, lng]);
  
  return (
    <div 
      ref={mapRef}
      className="w-full h-64 bg-gray-100 rounded-lg shadow-sm"
      aria-label={`Map showing location of property at ${location}`}
    ></div>
  );
};
