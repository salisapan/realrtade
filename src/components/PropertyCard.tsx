
import { Building2, MapPin, DollarSign, LineChart, Users, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";

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
}

export const PropertyCard = ({
  image,
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
}: PropertyCardProps) => {
  return (
    <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg animate-fade-in">
      <div className="relative">
        <img
          src={image}
          alt={title}
          className="w-full h-48 object-cover"
        />
        <div className="absolute bottom-3 left-3 bg-white px-4 py-1 rounded-full shadow-md">
          <span className="text-lg font-bold text-gray-900">${price}</span>
        </div>
      </div>
      
      <div className="p-4">
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={16} className="text-gray-500" />
          <span className="text-gray-600 text-sm">{location}</span>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Building2 size={16} className="text-gray-500" />
          <span className="text-gray-600 text-sm">{company}</span>
          <a href={website} className="text-primary text-sm ml-auto hover:underline">
            {website}
          </a>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-gray-500" />
            <span className="text-sm">{cashOnCash} Cash on cash</span>
          </div>
          <div className="flex items-center gap-2">
            <LineChart size={16} className="text-gray-500" />
            <span className="text-sm">{upside} upside</span>
          </div>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-500" />
            <span className="text-sm">{funded} funded</span>
          </div>
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-gray-500" />
            <span className="text-sm">{rented} rented</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <span className="block text-gray-500">Area</span>
            {sqft} sqft
          </div>
          <div>
            <span className="block text-gray-500">Floors</span>
            {floors}
          </div>
          <div>
            <span className="block text-gray-500">Status</span>
            {status}
          </div>
          <div>
            <span className="block text-gray-500">Year</span>
            {year}
          </div>
        </div>
      </div>
    </Card>
  );
};
