
import { UserPreferences, PropertyRecommendation } from './types';

// This is a simplified recommendation engine for demo purposes
// In a real app, this would be more sophisticated, possibly server-side

// Sample properties from the data store
const properties = [
  {
    id: 'prop1',
    name: 'Skyline Tower',
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab',
    location: 'New York, NY',
    projectedYield: '12.5%',
    riskLevel: 'Medium',
    assetType: 'Commercial',
    price: '$12,500,000',
    developerName: 'EXTELL',
  },
  {
    id: 'prop2',
    name: 'Harborview Residences',
    imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00',
    location: 'San Francisco, CA',
    projectedYield: '9.8%',
    riskLevel: 'Low',
    assetType: 'Residential',
    price: '$18,700,000',
    developerName: 'Urban Horizon',
  },
  {
    id: 'prop3',
    name: 'Greenfield Industrial Park',
    imageUrl: 'https://images.unsplash.com/photo-1553522911-ec3c9ba44d3b',
    location: 'Dallas, TX',
    projectedYield: '15.2%',
    riskLevel: 'High',
    assetType: 'Industrial',
    price: '$42,500,000',
    developerName: 'Pinnacle Developers',
  },
  {
    id: 'prop4',
    name: 'Downtown Office Plaza',
    imageUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72',
    location: 'Chicago, IL',
    projectedYield: '10.5%',
    riskLevel: 'Medium',
    assetType: 'Commercial',
    price: '$22,300,000',
    developerName: 'EXTELL',
  },
  {
    id: 'prop5',
    name: 'Retail Center West',
    imageUrl: 'https://images.unsplash.com/photo-1555636222-cae831e670b3',
    location: 'Los Angeles, CA',
    projectedYield: '11.0%',
    riskLevel: 'Low',
    assetType: 'Retail',
    price: '$15,800,000',
    developerName: 'Urban Horizon',
  },
  {
    id: 'prop6',
    name: 'Tech Park Campus',
    imageUrl: 'https://images.unsplash.com/photo-1556761175-b413da4baf72',
    location: 'Austin, TX',
    projectedYield: '13.8%',
    riskLevel: 'Medium',
    assetType: 'Mixed-Use',
    price: '$31,200,000',
    developerName: 'Pinnacle Developers',
  },
];

// Generate rationale based on user preferences and property attributes
const generateRationale = (property: any, preferences: UserPreferences): string => {
  const rationales = [];

  // Risk tolerance match
  if (
    (preferences.riskTolerance === 'low' && property.riskLevel === 'Low') ||
    (preferences.riskTolerance === 'medium' && property.riskLevel === 'Medium') ||
    (preferences.riskTolerance === 'high' && property.riskLevel === 'High')
  ) {
    rationales.push(`Matches your ${preferences.riskTolerance}-risk preference`);
  }

  // Asset type match
  if (preferences.assetTypes.includes(property.assetType)) {
    rationales.push(`${property.assetType} property aligned with your interests`);
  }

  // Yield consideration
  const yieldValue = parseFloat(property.projectedYield.replace('%', ''));
  if (yieldValue > 12) {
    rationales.push('High potential returns');
  } else if (yieldValue > 10) {
    rationales.push('Solid expected returns');
  } else {
    rationales.push('Stable expected returns');
  }

  // Location benefit
  rationales.push(`Prime location in ${property.location.split(',')[0]}`);

  // Return 2-3 rationales combined
  return rationales.slice(0, 3).join('. ') + '.';
};

// Calculate match score based on preferences
const calculateMatchScore = (property: any, preferences: UserPreferences): number => {
  let score = 70; // Base score

  // Risk tolerance match
  if (
    (preferences.riskTolerance === 'low' && property.riskLevel === 'Low') ||
    (preferences.riskTolerance === 'medium' && property.riskLevel === 'Medium') ||
    (preferences.riskTolerance === 'high' && property.riskLevel === 'High')
  ) {
    score += 10;
  } else if (
    (preferences.riskTolerance === 'low' && property.riskLevel === 'High') ||
    (preferences.riskTolerance === 'high' && property.riskLevel === 'Low')
  ) {
    score -= 5;
  }

  // Asset type match
  if (preferences.assetTypes.includes(property.assetType)) {
    score += 15;
  }

  // Add some randomness for variety (±5 points)
  score += Math.floor(Math.random() * 11) - 5;

  // Ensure score is within 0-100 range
  return Math.min(Math.max(score, 60), 98);
};

export const getRecommendations = (preferences: UserPreferences): PropertyRecommendation[] => {
  if (!preferences.riskTolerance || !preferences.investmentHorizon || !preferences.assetTypes || preferences.assetTypes.length === 0) {
    return [];
  }

  // Score and sort all properties
  const scoredProperties = properties
    .map(property => {
      const matchScore = calculateMatchScore(property, preferences);
      const rationale = generateRationale(property, preferences);
      
      return {
        id: property.id,
        name: property.name,
        imageUrl: property.imageUrl,
        location: property.location,
        projectedYield: property.projectedYield,
        riskLevel: property.riskLevel,
        matchScore,
        rationale,
        assetType: property.assetType,
        price: property.price,
        developerName: property.developerName
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  // Return top recommendations
  return scoredProperties.slice(0, 5);
};
