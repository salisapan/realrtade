
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
    <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg animate-fade-in card-hover h-full">
      <div className="relative">
        <img
          src={displayImage}
          alt={title}
          className="w-full h-48 sm:h-56 object-cover"
        />
        <div className="absolute bottom-3 left-3 bg-white px-3 py-1 rounded-full shadow-md">
          <span className="text-lg font-bold text-gray-900">{price ? `$${price}` : ""}</span>
        </div>
        <div className="absolute top-3 right-3">
          <Badge variant="default" className="bg-primary shadow-sm">
            {status}
          </Badge>
        </div>
        {minInvestment && (
          <div className="absolute top-3 left-3">
            <Badge variant="outline" className="bg-white text-gray-800 border-gray-200 shadow-sm">
              Min: ${minInvestment.toLocaleString()}
            </Badge>
          </div>
        )}
      </div>
      
      <div className="p-4 md:p-5">
        <h3 className="text-lg md:text-xl font-semibold mb-2 line-clamp-2">{title}</h3>
        
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={16} className="text-secondary flex-shrink-0" />
          <span className="text-gray-600 text-sm truncate">{location}</span>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <Building2 size={16} className="text-secondary flex-shrink-0" />
          <span className="text-gray-600 text-sm truncate">{company}</span>
          <span className="text-primary text-sm ml-auto truncate">
            {website && website.replace(/^https?:\/\//i, '')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-secondary flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium">{cashOnCash}</span> 
              <span className="text-gray-500 text-xs block">Cash on cash</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LineChart size={16} className="text-secondary flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium">{upside}</span>
              <span className="text-gray-500 text-xs block">Upside</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-secondary flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium">{funded}</span>
              <span className="text-gray-500 text-xs block">Funded</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-secondary flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium">{rented}</span>
              <span className="text-gray-500 text-xs block">Rented</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm border-t pt-3 mt-2">
          <div>
            <span className="block text-gray-500 text-xs">Area</span>
            <span className="font-medium">{sqft}</span>
          </div>
          <div>
            <span className="block text-gray-500 text-xs">Floors</span>
            <span className="font-medium">{floors}</span>
          </div>
          <div>
            <span className="block text-gray-500 text-xs">Year</span>
            <span className="font-medium">{year}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="block text-xs text-gray-500">Built</span>
            <Calendar size={14} className="text-secondary" />
          </div>
        </div>
      </div>
    </Card>
  );
};
