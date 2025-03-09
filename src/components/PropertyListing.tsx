
import { useNavigate } from "react-router-dom";
import { PropertyCard } from "@/components/PropertyCard";

interface PropertyListingProps {
  properties: any[];
}

export const PropertyListing = ({ properties }: PropertyListingProps) => {
  const navigate = useNavigate();

  const handlePropertyClick = (propertyId: string) => {
    navigate(`/property/${propertyId}`);
  };

  return (
    <div className="grid gap-3 sm:gap-4 w-full px-1 sm:px-2">
      {properties.map((property) => (
        <div 
          key={property.id} 
          onClick={() => handlePropertyClick(property.id)} 
          className="cursor-pointer w-full mb-1 sm:mb-2"
        >
          <PropertyCard {...property} />
        </div>
      ))}
    </div>
  );
};
