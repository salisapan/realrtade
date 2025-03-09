
import { propertiesBySector, propertiesByLowRisk, propertiesByGeography, propertiesByProfitable, propertiesByCompany } from "@/data/propertyData";

// Helper function to get properties for the selected category
export const getCategoryProperties = (category: string) => {
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
