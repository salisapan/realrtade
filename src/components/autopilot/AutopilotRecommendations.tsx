
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, TrendingUp, Shield, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type Property = {
  id: string;
  name: string;
  location: string;
  image: string;
  expectedYield: number;
  riskLevel: 'low' | 'medium' | 'high';
  fundingProgress: number;
  tags: string[];
  minInvestment: number;
};

type AutopilotRecommendationsProps = {
  filter: 'all' | 'low-risk' | 'high-yield' | 'growth';
};

export const AutopilotRecommendations = ({ filter }: AutopilotRecommendationsProps) => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real app, this would fetch from an API with proper filtering
    // For this demo, we'll use sample data and filter on the client
    const sampleProperties: Property[] = [
      {
        id: "prop-1",
        name: "The International Gem Tower",
        location: "New York, NY",
        image: "/placeholder.svg",
        expectedYield: 8.5,
        riskLevel: 'low',
        fundingProgress: 75,
        tags: ['commercial', 'office', 'low-risk'],
        minInvestment: 100
      },
      {
        id: "prop-2",
        name: "4 Bed in Arabian Ranches",
        location: "Dubai, UAE",
        image: "/placeholder.svg",
        expectedYield: 12.3,
        riskLevel: 'medium',
        fundingProgress: 60,
        tags: ['residential', 'high-yield'],
        minInvestment: 250
      },
      {
        id: "prop-3",
        name: "Seaside Apartments",
        location: "Miami, FL",
        image: "/placeholder.svg",
        expectedYield: 10.1,
        riskLevel: 'medium',
        fundingProgress: 45,
        tags: ['residential', 'coastal', 'growth'],
        minInvestment: 200
      },
      {
        id: "prop-4",
        name: "Downtown Retail Space",
        location: "Austin, TX",
        image: "/placeholder.svg",
        expectedYield: 7.8,
        riskLevel: 'low',
        fundingProgress: 80,
        tags: ['commercial', 'retail', 'low-risk'],
        minInvestment: 150
      }
    ];
    
    // Filter properties based on the selected filter
    let filteredProperties = [...sampleProperties];
    
    if (filter === 'low-risk') {
      filteredProperties = sampleProperties.filter(p => p.riskLevel === 'low');
    } else if (filter === 'high-yield') {
      filteredProperties = sampleProperties.filter(p => p.expectedYield >= 10);
    } else if (filter === 'growth') {
      filteredProperties = sampleProperties.filter(p => p.tags.includes('growth'));
    }
    
    setProperties(filteredProperties);
    setLoading(false);
  }, [filter]);

  // Function to get tag icon based on risk level
  const getRiskIcon = (riskLevel: 'low' | 'medium' | 'high') => {
    switch (riskLevel) {
      case 'low':
        return <Shield className="h-4 w-4 text-green-500" />;
      case 'medium':
        return <Shield className="h-4 w-4 text-yellow-500" />;
      case 'high':
        return <Shield className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Autopilot Recommendations</h2>
        <p className="text-sm text-muted-foreground">
          Properties selected for your investment goals
        </p>
      </div>
      
      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2">
        {properties.map((property) => (
          <Card key={property.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <div className="aspect-video w-full overflow-hidden">
              <img 
                src={property.image} 
                alt={property.name}
                className="h-full w-full object-cover"
              />
            </div>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{property.name}</CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {property.location}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  <TrendingUp className="h-3 w-3" />
                  {property.expectedYield}% Yield
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-2">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">
                    {getRiskIcon(property.riskLevel)}
                    <span className="ml-1 capitalize">{property.riskLevel} Risk</span>
                  </div>
                  {property.tags.slice(0, 2).map((tag) => (
                    <span 
                      key={tag} 
                      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Funding Progress</span>
                    <span>{property.fundingProgress}%</span>
                  </div>
                  <Progress value={property.fundingProgress} className="h-2" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-2">
              <div className="flex w-full items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Min: ${property.minInvestment}
                </span>
                <Button size="sm" variant="outline" className="gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Add to Autopilot
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
      
      {properties.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground opacity-20" />
          <h3 className="mt-4 text-lg font-medium">No properties found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            There are no properties matching your selected filter.
          </p>
        </div>
      )}
    </div>
  );
};
