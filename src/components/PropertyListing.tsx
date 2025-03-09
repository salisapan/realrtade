
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
    <div className="grid gap-4 sm:gap-5 w-full px-2 sm:px-0 pb-16 sm:pb-4">
      {properties.map((property) => (
        <div 
          key={property.id} 
          onClick={() => handlePropertyClick(property.id)} 
          className="cursor-pointer w-full mb-2 max-w-full overflow-hidden"
        >
          <PropertyCard {...property} />
        </div>
      ))}
    </div>
  );
};
