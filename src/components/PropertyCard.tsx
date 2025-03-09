
import { Building2, MapPin, DollarSign, LineChart, Users, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PropertyCardProps {
  image: string;
  title: string;
  location: string;
  company: string;
  website: string;
  cashOnCash: string;
  upside: string;
  funded: string;
  rented: string;
  sqft: string;
  floors: string;
  status: string;
  year: string;
  price: string;
  id?: string;
  minInvestment?: number;
  imageUrl?: string; // Adding support for alternate image property name
}

export const PropertyCard = ({
  image,
  imageUrl,
  title,
  location,
  company,
  website,
  cashOnCash,
  upside,
  funded,
  rented,
  sqft,
  floors,
  status,
  year,
  price,
  id = "",
  minInvestment = 2500,
}: PropertyCardProps) => {
  // Handle both image and imageUrl properties
  const displayImage = image || imageUrl;
  
  return (
    <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg animate-fade-in card-hover h-full property-card-container">
      <div className="relative">
        <img
          src={displayImage}
          alt={title}
          className="w-full h-40 sm:h-48 object-cover"
        />
        <div className="absolute bottom-2 left-2 bg-white px-2 py-1 rounded-full shadow-md">
          <span className="text-sm sm:text-lg font-bold text-gray-900">{price ? `$${price}` : ""}</span>
        </div>
        <div className="absolute top-2 right-2">
          <Badge variant="default" className="bg-primary shadow-sm text-xs">
            {status}
          </Badge>
        </div>
        {minInvestment && (
          <div className="absolute top-2 left-2">
            <Badge variant="outline" className="bg-white text-gray-800 border-gray-200 shadow-sm text-xs">
              Min: ${minInvestment.toLocaleString()}
            </Badge>
          </div>
        )}
      </div>
      
      <div className="p-3 sm:p-4 md:p-5 property-card-content">
        <h3 className="text-base sm:text-lg md:text-xl font-semibold mb-1 sm:mb-2 line-clamp-2">{title}</h3>
        
        <div className="flex items-center gap-1 sm:gap-2 mb-2">
          <MapPin size={14} className="text-secondary flex-shrink-0" />
          <span className="text-xs sm:text-sm text-gray-600 truncate">{location}</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 mb-3">
          <Building2 size={14} className="text-secondary flex-shrink-0" />
          <span className="text-xs sm:text-sm text-gray-600 truncate">{company}</span>
          <span className="text-primary text-xs sm:text-sm ml-auto truncate">
            {website && website.replace(/^https?:\/\//i, '')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-2 sm:gap-x-4 gap-y-2 sm:gap-y-3 mb-3 property-metrics">
          <div className="flex items-center gap-1 sm:gap-2">
            <DollarSign size={14} className="text-secondary flex-shrink-0" />
            <div className="text-xs sm:text-sm">
              <span className="font-medium">{cashOnCash}</span> 
              <span className="text-gray-500 text-2xs sm:text-xs block">Cash on cash</span>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <LineChart size={14} className="text-secondary flex-shrink-0" />
            <div className="text-xs sm:text-sm">
              <span className="font-medium">{upside}</span>
              <span className="text-gray-500 text-2xs sm:text-xs block">Upside</span>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Users size={14} className="text-secondary flex-shrink-0" />
            <div className="text-xs sm:text-sm">
              <span className="font-medium">{funded}</span>
              <span className="text-gray-500 text-2xs sm:text-xs block">Funded</span>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Building2 size={14} className="text-secondary flex-shrink-0" />
            <div className="text-xs sm:text-sm">
              <span className="font-medium">{rented}</span>
              <span className="text-gray-500 text-2xs sm:text-xs block">Rented</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm border-t pt-2 sm:pt-3 mt-1 sm:mt-2">
          <div>
            <span className="block text-gray-500 text-2xs sm:text-xs">Area</span>
            <span className="font-medium truncate">{sqft}</span>
          </div>
          <div>
            <span className="block text-gray-500 text-2xs sm:text-xs">Floors</span>
            <span className="font-medium truncate">{floors}</span>
          </div>
          <div>
            <span className="block text-gray-500 text-2xs sm:text-xs">Year</span>
            <span className="font-medium truncate">{year}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="block text-2xs sm:text-xs text-gray-500">Built</span>
            <Calendar size={12} className="text-secondary" />
          </div>
        </div>
      </div>
    </Card>
  );
};
