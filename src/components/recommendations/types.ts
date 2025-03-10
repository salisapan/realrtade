
export interface UserPreferences {
  riskTolerance: 'low' | 'medium' | 'high';
  investmentHorizon: '1-2' | '3-5' | '5+';
  assetTypes: string[];
}

export interface PropertyRecommendation {
  id: string;
  name: string;
  imageUrl: string;
  location: string;
  projectedYield: string;
  riskLevel: string;
  matchScore: number;
  rationale: string;
  assetType: string;
  price: string;
  developerName: string;
}
