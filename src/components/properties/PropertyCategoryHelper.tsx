
import { useState, useEffect } from "react";
import { propertiesBySector, propertiesByLowRisk, propertiesByGeography, propertiesByProfitable, propertiesByCompany } from "@/data/propertyData";
import { getPropertiesByCategory, getAllProperties } from "@/services/propertyService";

// Helper function to get properties for the selected category from local data
export const getCategoryPropertiesLocal = (category: string) => {
  switch (category) {
    case "sector":
      return propertiesBySector;
    case "low-risk":
      return propertiesByLowRisk;
    case "geography":
      return propertiesByGeography;
    case "profitable":
      return propertiesByProfitable;
    case "company":
      return propertiesByCompany;
    default:
      return propertiesBySector;
  }
};

// Hook to get properties from Supabase with fallback to local data
export const useProperties = (category?: string) => {
  const [properties, setProperties] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const fetchProperties = async () => {
      try {
        setIsLoading(true);
        let result;
        
        if (category) {
          result = await getPropertiesByCategory(category);
        } else {
          result = await getAllProperties();
        }
        
        // If we got results from Supabase, use them
        if (result && result.length > 0) {
          setProperties(result);
        } else {
          // Fallback to local data if no results from Supabase
          const localProperties = category ? 
            getCategoryPropertiesLocal(category) : 
            [...propertiesBySector, ...propertiesByLowRisk, ...propertiesByGeography, ...propertiesByProfitable, ...propertiesByCompany];
          
          setProperties(localProperties);
        }
      } catch (err) {
        console.error("Error fetching properties:", err);
        setError(err instanceof Error ? err : new Error("Failed to fetch properties"));
        
        // Fallback to local data on error
        const localProperties = category ? 
          getCategoryPropertiesLocal(category) : 
          [...propertiesBySector, ...propertiesByLowRisk, ...propertiesByGeography, ...propertiesByProfitable, ...propertiesByCompany];
        
        setProperties(localProperties);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProperties();
  }, [category]);
  
  return { properties, isLoading, error };
};
