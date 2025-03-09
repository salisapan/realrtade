
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
    <div className="property-listing-grid w-full">
      {properties.map((property) => (
        <div 
          key={property.id} 
          onClick={() => handlePropertyClick(property.id)} 
          className="cursor-pointer w-full mb-4 sm:mb-0"
        >
          <PropertyCard {...property} />
        </div>
      ))}
    </div>
  );
};
