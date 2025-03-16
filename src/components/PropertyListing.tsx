
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
    <div className={`grid w-full pb-6 px-2 sm:px-4 md:px-6
      ${isMobile 
        ? 'grid-cols-1 gap-3' 
        : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'}`}>
      {properties.map((property) => (
        <div 
          key={property.id} 
          onClick={() => handlePropertyClick(property.id)} 
          className="cursor-pointer w-full transform transition-transform duration-300 hover:translate-y-[-4px]"
        >
          <PropertyCard {...property} />
        </div>
      ))}
    </div>
  );
};
