
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PropertyDetailsCardProps {
  property: {
    type: string;
    yearBuilt: number;
    squareFootage: number;
    occupancyRate: number;
    capRate: number;
    noi: number;
  };
}

export const PropertyDetailsCard = ({ property }: PropertyDetailsCardProps) => {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Property Details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Property Type</span>
            <span className="font-medium">{property.type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Year Built</span>
            <span className="font-medium">{property.yearBuilt}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Square Footage</span>
            <span className="font-medium">{property.squareFootage.toLocaleString()} sq ft</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Occupancy Rate</span>
            <span className="font-medium">{property.occupancyRate}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Cap Rate</span>
            <span className="font-medium">{property.capRate}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Net Operating Income</span>
            <span className="font-medium">${property.noi.toLocaleString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
