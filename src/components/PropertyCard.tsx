
import { Building2, MapPin, DollarSign, LineChart, Users, Calendar, ShieldCheck, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PropertyCardProps {
  image: string;
  title: string;
  location: string;
  company: string;
  website?: string;
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
  verified?: boolean;
  minInvestment?: string;
  daysLeft?: number;
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
  id,
  verified = false,
  minInvestment = "$10,000",
  daysLeft = 30,
}: PropertyCardProps) => {
  return (
    <Card className="overflow-hidden transition-all duration-300 hover:shadow-card-hover animate-fade-in h-full flex flex-col">
      <div className="relative">
        <img
          src={image}
          alt={title}
          className="w-full h-48 object-cover"
        />
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {verified && (
            <Badge className="bg-secondary text-primary text-xs flex items-center gap-1 font-medium">
              <ShieldCheck className="w-3 h-3" />
              Verified
            </Badge>
          )}
        </div>
        <div className="absolute bottom-3 left-3 bg-white px-4 py-1 rounded-full shadow-md flex items-center">
          <span className="text-lg font-bold text-primary">${price}</span>
        </div>
        <div className="absolute bottom-3 right-3">
          <Badge variant="outline" className="bg-white/80 backdrop-blur-sm text-xs font-medium">
            Min: {minInvestment}
          </Badge>
        </div>
      </div>
      
      <div className="p-4 flex-1 flex flex-col">
        <div className="mb-auto">
          <h3 className="text-lg font-semibold mb-1 font-heading text-primary-dark">{title}</h3>
          
          <div className="flex items-center gap-1 mb-3 text-muted-foreground">
            <MapPin size={14} className="flex-shrink-0" />
            <span className="text-sm truncate">{location}</span>
          </div>

          <div className="flex items-center gap-1 mb-3 text-muted-foreground">
            <Building2 size={14} className="flex-shrink-0" />
            <span className="text-sm truncate">{company}</span>
            {website && (
              <a href={website} className="text-primary text-sm ml-auto hover:underline">
                {website}
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="flex items-center gap-1.5">
            <DollarSign size={14} className="text-secondary" />
            <span className="text-sm">{cashOnCash} CoC</span>
          </div>
          <div className="flex items-center gap-1.5">
            <LineChart size={14} className="text-secondary" />
            <span className="text-sm">{upside} upside</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-secondary" />
            <span className="text-sm">{funded} funded</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Building2 size={14} className="text-secondary" />
            <span className="text-sm">{rented} rented</span>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-2 justify-between mb-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock size={14} />
              <span className="text-xs">{daysLeft} days left</span>
            </div>
            <div className="progress-bar-container w-24">
              <div className="progress-bar-fill" style={{ width: funded }}></div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>
              <span className="block text-muted-foreground/70">Area</span>
              <span className="font-medium text-foreground">{sqft}</span>
            </div>
            <div>
              <span className="block text-muted-foreground/70">Floors</span>
              <span className="font-medium text-foreground">{floors}</span>
            </div>
            <div>
              <span className="block text-muted-foreground/70">Status</span>
              <span className="font-medium text-foreground">{status}</span>
            </div>
            <div>
              <span className="block text-muted-foreground/70">Year</span>
              <span className="font-medium text-foreground">{year}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
