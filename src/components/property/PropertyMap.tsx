
import { useEffect, useRef, useState } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PropertyMapProps {
  location: string;
  lat?: number;
  lng?: number;
}

export const PropertyMap = ({ location, lat = 40.7128, lng = -74.0060 }: PropertyMapProps) => {
  const mapRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapError, setMapError] = useState(false);
  
  useEffect(() => {
    // Using Google Maps embed as a more reliable alternative
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);
    
    return () => {
      clearTimeout(timer);
    };
  }, [location]);
  
  const handleMapError = () => {
    setMapError(true);
    setIsLoading(false);
  };

  // Format location for URL
  const formattedLocation = encodeURIComponent(location);
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${formattedLocation}`;
  
  // Google Maps embed URL
  const mapEmbedUrl = `https://www.google.com/maps/embed/v1/place?key=AIzaSyDJPtQVJ6mXBCUzrXgXXtK1n3G6iarWl8s&q=${formattedLocation}`;
  
  return (
    <div className="relative w-full h-64 md:h-80 bg-gray-100 rounded-lg shadow-sm overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <span className="ml-2 text-gray-600">Loading map...</span>
        </div>
      )}
      
      {!mapError ? (
        <iframe 
          ref={mapRef}
          src={mapEmbedUrl}
          className="w-full h-full border-0" 
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          onError={handleMapError}
          aria-label={`Map showing location of property at ${location}`}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-10">
          <p className="text-gray-500">Map could not be loaded</p>
          <p className="text-sm text-gray-400 mb-2">{location}</p>
          <Button 
            variant="outline"
            size="sm"
            asChild
            className="text-primary text-sm hover:underline"
          >
            <a 
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              View on Google Maps
            </a>
          </Button>
        </div>
      )}
      
      <div className="absolute bottom-3 left-3 bg-white px-3 py-1.5 rounded-md shadow-sm z-20">
        <p className="text-sm font-medium">{location}</p>
      </div>
    </div>
  );
};
