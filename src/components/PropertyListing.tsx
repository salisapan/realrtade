
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
    <div className="property-listing-grid w-full px-2 md:px-0">
      {properties.map((property) => (
        <div 
          key={property.id} 
          onClick={() => handlePropertyClick(property.id)} 
          className="cursor-pointer w-full mb-4 sm:mb-4"
        >
          <PropertyCard {...property} />
        </div>
      ))}
    </div>
  );
};
