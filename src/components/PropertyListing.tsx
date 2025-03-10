
import { useNavigate } from "react-router-dom";
import { PropertyCard } from "@/components/PropertyCard";
import { useIsMobile } from "@/hooks/use-mobile";

interface PropertyListingProps {
  properties: any[];
}

export const PropertyListing = ({ properties }: PropertyListingProps) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const handlePropertyClick = (propertyId: string) => {
    navigate(`/property/${propertyId}`);
  };

  return (
    <div className={`grid gap-4 sm:gap-5 w-full px-2 sm:px-0 pb-8 sm:pb-4 
      ${isMobile ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
      {properties.map((property) => (
        <div 
          key={property.id} 
          onClick={() => handlePropertyClick(property.id)} 
          className="cursor-pointer w-full mb-2 hover:translate-y-[-4px] transition-transform duration-300"
        >
          <PropertyCard {...property} />
        </div>
      ))}
    </div>
  );
};
