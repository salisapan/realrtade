
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Loader2 } from 'lucide-react';

interface PropertyMapProps {
  location: string;
  lat?: number;
  lng?: number;
}

// This would typically come from an environment variable or Supabase secrets
// For now, we'll use a public token that's limited to this domain
const MAPBOX_TOKEN = 'pk.eyJ1IjoibG92YWJsZS1haS1kZXYiLCJhIjoiY2xzdDRiN2I5MHU4cDJrcWR0ZzBvOGQ3ciJ9.Jw8NoE3H682yr7vVLYYYpw';

export const PropertyMap = ({ location, lat = 40.7128, lng = -74.0060 }: PropertyMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapError, setMapError] = useState(false);
  
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Initialize Mapbox with access token
    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    try {
      // Create the map instance
      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mapbox/streets-v12', // Standard street style
        center: [lng, lat],
        zoom: 14,
        interactive: true,
        attributionControl: false
      });
      
      // Add zoom and rotation controls
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      
      // Add a marker at the property location
      new mapboxgl.Marker({ color: '#0070f3' })
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(location))
        .addTo(map);
      
      // Handle map load completion
      map.on('load', () => {
        setIsLoading(false);
      });
      
      // Handle map load error
      map.on('error', () => {
        setMapError(true);
        setIsLoading(false);
      });
      
      // Cleanup function to remove the map when component unmounts
      return () => {
        map.remove();
      };
    } catch (error) {
      console.error('Error initializing map:', error);
      setMapError(true);
      setIsLoading(false);
    }
  }, [location, lat, lng]);
  
  return (
    <div className="relative w-full h-64 md:h-80 bg-gray-100 rounded-lg shadow-sm overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <span className="ml-2 text-gray-600">Loading map...</span>
        </div>
      )}
      
      <div 
        ref={mapRef}
        className="w-full h-full" 
        aria-label={`Map showing location of property at ${location}`}
      />
      
      {mapError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-10">
          <p className="text-gray-500">Map could not be loaded</p>
          <p className="text-sm text-gray-400 mb-2">{location}</p>
          <a 
            href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm hover:underline"
          >
            View on Google Maps
          </a>
        </div>
      )}
      
      <div className="absolute bottom-3 left-3 bg-white px-3 py-1.5 rounded-md shadow-sm z-20">
        <p className="text-sm font-medium">{location}</p>
      </div>
    </div>
  );
};
