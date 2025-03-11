
import { Building2, MapPin, DollarSign, LineChart, Users, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

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
  imageUrl?: string;
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
  const displayImage = image || imageUrl;
  
  return (
    <Link to={`/property/${id}`} className="block h-full group">
      <Card className="h-full overflow-hidden transition-all duration-500 animate-fade-in relative
                     hover:shadow-lg hover:shadow-blue-100/50 hover:-translate-y-1 border border-gray-100/80">
        {/* Animated gradient background on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-100/10 to-transparent opacity-0 blur-xl group-hover:opacity-20 transition-opacity duration-500 z-0"></div>
        
        {/* Image container with zoom effect */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-t-lg">
          <img
            src={displayImage}
            alt={title}
            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute bottom-3 left-3 bg-white px-3 py-1 rounded-full shadow-md 
                         transform group-hover:translate-y-0 group-hover:shadow-blue-200 transition-all duration-300">
            <span className="text-lg font-bold text-gray-900">{price ? `$${price}` : ""}</span>
          </div>
          <div className="absolute top-3 right-3 transform group-hover:translate-y-0 transition-transform duration-300">
            <Badge variant="default" className="bg-primary shadow-sm group-hover:shadow-md group-hover:shadow-blue-200/50 transition-shadow duration-300">
              {status}
            </Badge>
          </div>
          {minInvestment && (
            <div className="absolute top-3 left-3 transform group-hover:translate-y-0 transition-transform duration-300">
              <Badge variant="outline" className="bg-white text-gray-800 border-gray-200 shadow-sm 
                                                group-hover:bg-blue-50 group-hover:border-blue-200 transition-all duration-300">
                Min: ${minInvestment.toLocaleString()}
              </Badge>
            </div>
          )}
        </div>
        
        <div className="p-4 relative z-10">
          <h3 className="text-lg font-semibold mb-2 break-words line-clamp-2 group-hover:text-blue-700 transition-colors duration-300">{title}</h3>
          
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-secondary flex-shrink-0 group-hover:text-blue-500 transition-colors duration-300" />
            <span className="text-gray-600 text-sm break-words group-hover:text-gray-700 transition-colors duration-300">{location}</span>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} className="text-secondary flex-shrink-0 group-hover:text-blue-500 transition-colors duration-300" />
            <span className="text-gray-600 text-sm break-words group-hover:text-gray-700 transition-colors duration-300">{company}</span>
            <span className="text-primary text-sm ml-auto truncate group-hover:text-blue-600 transition-colors duration-300">
              {website && website.replace(/^https?:\/\//i, '')}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="flex items-center gap-2 group-hover:bg-blue-50/50 p-1.5 rounded-md transition-colors duration-300">
              <DollarSign size={16} className="text-secondary flex-shrink-0 group-hover:text-blue-500 transition-colors duration-300" />
              <div className="text-sm">
                <span className="font-medium group-hover:text-blue-700 transition-colors duration-300">{cashOnCash}</span> 
                <span className="text-gray-500 text-xs block">Cash on cash</span>
              </div>
            </div>
            <div className="flex items-center gap-2 group-hover:bg-blue-50/50 p-1.5 rounded-md transition-colors duration-300">
              <LineChart size={16} className="text-secondary flex-shrink-0 group-hover:text-blue-500 transition-colors duration-300" />
              <div className="text-sm">
                <span className="font-medium group-hover:text-blue-700 transition-colors duration-300">{upside}</span>
                <span className="text-gray-500 text-xs block">Upside</span>
              </div>
            </div>
            <div className="flex items-center gap-2 group-hover:bg-blue-50/50 p-1.5 rounded-md transition-colors duration-300">
              <Users size={16} className="text-secondary flex-shrink-0 group-hover:text-blue-500 transition-colors duration-300" />
              <div className="text-sm">
                <span className="font-medium group-hover:text-blue-700 transition-colors duration-300">{funded}</span>
                <span className="text-gray-500 text-xs block">Funded</span>
              </div>
            </div>
            <div className="flex items-center gap-2 group-hover:bg-blue-50/50 p-1.5 rounded-md transition-colors duration-300">
              <Building2 size={16} className="text-secondary flex-shrink-0 group-hover:text-blue-500 transition-colors duration-300" />
              <div className="text-sm">
                <span className="font-medium group-hover:text-blue-700 transition-colors duration-300">{rented}</span>
                <span className="text-gray-500 text-xs block">Rented</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm border-t pt-3">
            <div className="group-hover:bg-blue-50/50 p-1 rounded transition-colors duration-300">
              <span className="block text-gray-500 text-xs">Area</span>
              <span className="font-medium break-words group-hover:text-blue-700 transition-colors duration-300">{sqft}</span>
            </div>
            <div className="group-hover:bg-blue-50/50 p-1 rounded transition-colors duration-300">
              <span className="block text-gray-500 text-xs">Floors</span>
              <span className="font-medium break-words group-hover:text-blue-700 transition-colors duration-300">{floors}</span>
            </div>
            <div className="group-hover:bg-blue-50/50 p-1 rounded transition-colors duration-300">
              <span className="block text-gray-500 text-xs">Year</span>
              <span className="font-medium group-hover:text-blue-700 transition-colors duration-300">{year}</span>
            </div>
            <div className="flex items-center gap-1 group-hover:bg-blue-50/50 p-1 rounded transition-colors duration-300">
              <span className="block text-xs text-gray-500">Built</span>
              <Calendar size={14} className="text-secondary group-hover:text-blue-500 transition-colors duration-300" />
            </div>
          </div>
        </div>
        
        {/* Animated border effect on hover */}
        <div className="absolute bottom-0 left-0 h-0.5 w-0 bg-gradient-to-r from-blue-400 to-blue-200 
                       group-hover:w-full transition-all duration-1000 opacity-0 group-hover:opacity-100"></div>
      </Card>
    </Link>
  );
};
