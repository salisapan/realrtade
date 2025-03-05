
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
      mapContainer.style.border = '1px solid #e2e8f0';
      
      const mapContent = document.createElement('div');
      mapContent.style.width = '100%';
      mapContent.style.height = '100%';
      mapContent.style.backgroundImage = 'url("https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-s+ff4757(' + lng + ',' + lat + ')/' + lng + ',' + lat + ',14,0/600x400@2x?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4M29iazA2Z2gycXA4N2pmbDZmangifQ.-g_vE53SD2WrJ6tFX7QHmA")';
      mapContent.style.backgroundSize = 'cover';
      mapContent.style.backgroundPosition = 'center';
      
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
      
      // Create location label
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
      
      mapContainer.appendChild(mapContent);
      mapContainer.appendChild(zoomControls);
      mapContainer.appendChild(locationLabel);
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
