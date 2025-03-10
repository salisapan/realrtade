
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserPreferences } from './types';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles } from 'lucide-react';

interface RecommendationPreferenceFormProps {
  onSubmit: (preferences: UserPreferences) => void;
  initialPreferences?: UserPreferences;
}

export const RecommendationPreferenceForm = ({ 
  onSubmit,
  initialPreferences
}: RecommendationPreferenceFormProps) => {
  const [riskTolerance, setRiskTolerance] = useState<'low' | 'medium' | 'high'>(
    initialPreferences?.riskTolerance || 'medium'
  );
  
  const [investmentHorizon, setInvestmentHorizon] = useState<'1-2' | '3-5' | '5+'>(
    initialPreferences?.investmentHorizon || '3-5'
  );
  
  const [assetTypes, setAssetTypes] = useState<string[]>(
    initialPreferences?.assetTypes || ['Commercial']
  );

  const handleAssetTypeChange = (type: string) => {
    if (assetTypes.includes(type)) {
      setAssetTypes(assetTypes.filter(t => t !== type));
    } else {
      setAssetTypes([...assetTypes, type]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Create the preferences object
    const preferences: UserPreferences = {
      riskTolerance,
      investmentHorizon,
      assetTypes
    };
    
    onSubmit(preferences);
  };

  return (
    <Card className="shadow-sm mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center">
          <Sparkles className="h-5 w-5 mr-2 text-primary" />
          Personalize Your Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="mb-2 block">What's your risk tolerance?</Label>
            <RadioGroup 
              value={riskTolerance} 
              onValueChange={(value) => setRiskTolerance(value as 'low' | 'medium' | 'high')}
              className="flex flex-col sm:flex-row gap-2 sm:gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="low" id="risk-low" />
                <Label htmlFor="risk-low" className="cursor-pointer">Low</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="medium" id="risk-medium" />
                <Label htmlFor="risk-medium" className="cursor-pointer">Medium</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="high" id="risk-high" />
                <Label htmlFor="risk-high" className="cursor-pointer">High</Label>
              </div>
            </RadioGroup>
          </div>
          
          <div>
            <Label className="mb-2 block">How long do you plan to invest?</Label>
            <RadioGroup 
              value={investmentHorizon} 
              onValueChange={(value) => setInvestmentHorizon(value as '1-2' | '3-5' | '5+')}
              className="flex flex-col sm:flex-row gap-2 sm:gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="1-2" id="term-short" />
                <Label htmlFor="term-short" className="cursor-pointer">1-2 years</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="3-5" id="term-medium" />
                <Label htmlFor="term-medium" className="cursor-pointer">3-5 years</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="5+" id="term-long" />
                <Label htmlFor="term-long" className="cursor-pointer">5+ years</Label>
              </div>
            </RadioGroup>
          </div>
          
          <div>
            <Label className="mb-2 block">What types of properties interest you?</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="type-commercial" 
                  checked={assetTypes.includes('Commercial')}
                  onCheckedChange={() => handleAssetTypeChange('Commercial')}
                />
                <Label htmlFor="type-commercial" className="cursor-pointer">Commercial</Label>
              </div>
              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="type-residential" 
                  checked={assetTypes.includes('Residential')}
                  onCheckedChange={() => handleAssetTypeChange('Residential')}
                />
                <Label htmlFor="type-residential" className="cursor-pointer">Residential</Label>
              </div>
              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="type-industrial" 
                  checked={assetTypes.includes('Industrial')}
                  onCheckedChange={() => handleAssetTypeChange('Industrial')}
                />
                <Label htmlFor="type-industrial" className="cursor-pointer">Industrial</Label>
              </div>
              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="type-retail" 
                  checked={assetTypes.includes('Retail')}
                  onCheckedChange={() => handleAssetTypeChange('Retail')}
                />
                <Label htmlFor="type-retail" className="cursor-pointer">Retail</Label>
              </div>
              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="type-mixed" 
                  checked={assetTypes.includes('Mixed-Use')}
                  onCheckedChange={() => handleAssetTypeChange('Mixed-Use')}
                />
                <Label htmlFor="type-mixed" className="cursor-pointer">Mixed-Use</Label>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end pt-2">
            <Button type="submit" className="w-full sm:w-auto">
              Get Personalized Recommendations
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
