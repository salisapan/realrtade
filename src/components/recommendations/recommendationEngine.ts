
import { UserPreferences, PropertyRecommendation } from "./types";
import { propertiesBySector, propertiesByLowRisk, propertiesByGeography, propertiesByProfitable } from "@/data/propertyData";
import { getCategoryProperties } from "@/components/properties/PropertyCategoryHelper";

// Property images for recommendations
const propertyImages = [
  "https://images.unsplash.com/photo-1488972685288-c3fd157d7c7a?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
  "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
  "https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
  "https://images.unsplash.com/photo-1496307653780-42ee777d4833?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
  "https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
];

// Map preference values to property categories
const mapRiskToCategory = (risk: string): string => {
  switch (risk) {
    case 'low': return 'low-risk';
    case 'medium': return 'profitable';
    case 'high': return 'sector';
    default: return 'low-risk';
  }
};

// AI rationales based on preference combinations
const getRationale = (preferences: UserPreferences, assetType: string): string => {
  const { riskTolerance, investmentHorizon } = preferences;
  
  // Different rationales based on risk preference
  if (riskTolerance === 'low') {
    if (investmentHorizon === '1-2') {
      return `This ${assetType} property offers stable returns with minimal risk, ideal for your short-term investment goals. Its strong tenant profile provides security.`;
    } else if (investmentHorizon === '3-5') {
      return `Perfect match for your medium-term, low-risk strategy. This ${assetType} property has consistent cash flow and is in a stable market with reliable growth projections.`;
    } else {
      return `This ${assetType} investment aligns with your long-term, conservative approach. Historical performance indicates steady appreciation with minimal volatility.`;
    }
  } else if (riskTolerance === 'medium') {
    if (investmentHorizon === '1-2') {
      return `Balanced risk-return profile makes this ${assetType} property suitable for your short-term goals. Market indicators suggest good potential for capital appreciation.`;
    } else if (investmentHorizon === '3-5') {
      return `This ${assetType} property offers a strong blend of current income and growth potential, matching your medium-risk, mid-term investment strategy.`;
    } else {
      return `Selected for your long-term, balanced approach. This ${assetType} property has demonstrated consistent performance with moderate growth potential.`;
    }
  } else {
    if (investmentHorizon === '1-2') {
      return `This high-potential ${assetType} property is in a rapidly evolving market. Perfect for your short-term, growth-focused strategy with significant upside potential.`;
    } else if (investmentHorizon === '3-5') {
      return `Aligned with your growth-oriented strategy, this ${assetType} property is positioned in an emerging market with strong mid-term appreciation forecasts.`;
    } else {
      return `This ${assetType} investment offers exceptional long-term growth potential. Market analysis indicates high demand growth and potential for substantial returns.`;
    }
  }
};

// Get match score based on how well property matches preferences
const getMatchScore = (preferences: UserPreferences, property: any): number => {
  let score = 75; // Base score
  
  // Add points for matching asset type
  if (preferences.assetTypes.some(type => 
    property.title?.toLowerCase().includes(type) || 
    property.location?.toLowerCase().includes(type)
  )) {
    score += 10;
  }
  
  // Adjust for risk tolerance match
  const propertyRisk = "Medium"; // Default risk level
  if (
    (preferences.riskTolerance === 'low' && propertyRisk === "Low") ||
    (preferences.riskTolerance === 'medium' && propertyRisk === "Medium") ||
    (preferences.riskTolerance === 'high' && propertyRisk === "High")
  ) {
    score += 10;
  }
  
  // Random factor for realistic variation (±5%)
  score += Math.floor(Math.random() * 11) - 5;
  
  // Ensure score is within bounds
  return Math.min(99, Math.max(60, score));
};

// Generate AI recommendations based on user preferences
export const generateRecommendations = (preferences: UserPreferences): PropertyRecommendation[] => {
  // Get properties based on risk tolerance
  const category = mapRiskToCategory(preferences.riskTolerance);
  let propertyPool = getCategoryProperties(category);
  
  // Filter for asset types if possible
  const filteredProperties = propertyPool.filter(property => 
    preferences.assetTypes.some(type => 
      property.title?.toLowerCase().includes(type) || 
      property.location?.toLowerCase().includes(type)
    )
  );
  
  // Use filtered list if we have matches, otherwise use original pool
  const properties = filteredProperties.length > 0 ? filteredProperties : propertyPool;
  
  // Create recommendations
  const recommendations: PropertyRecommendation[] = properties.slice(0, 5).map((property, index) => {
    const assetType = preferences.assetTypes[index % preferences.assetTypes.length];
    const matchScore = getMatchScore(preferences, property);
    
    return {
      id: property.id || `rec-${index}`,
      name: property.title || `${assetType.charAt(0).toUpperCase() + assetType.slice(1)} Investment Opportunity`,
      imageUrl: property.image || propertyImages[index % propertyImages.length],
      location: property.location || "New York, NY",
      projectedYield: property.cashOnCash || "8-12%",
      riskLevel: preferences.riskTolerance === 'low' ? "Low" : preferences.riskTolerance === 'medium' ? "Medium" : "High",
      matchScore: matchScore,
      rationale: getRationale(preferences, assetType),
      assetType: assetType.charAt(0).toUpperCase() + assetType.slice(1),
      price: property.price || "$250,000 - $500,000",
      developerName: property.company || "Premium Developers"
    };
  });
  
  // Sort by match score (highest first)
  return recommendations.sort((a, b) => b.matchScore - a.matchScore);
};
