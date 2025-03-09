
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PropertyQuickInvestmentProps {
  roi: number;
  term: number;
  minInvestment?: number;
  onInvest: () => void;
}

export const PropertyQuickInvestment = ({
  roi,
  term,
  minInvestment = 2500,
  onInvest
}: PropertyQuickInvestmentProps) => {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Quick Investment</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Minimum</div>
            <div className="text-base font-bold text-gray-800">${(minInvestment).toLocaleString()}</div>
          </div>
          
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Expected Return</div>
            <div className="text-base font-bold">{roi}% per annum</div>
          </div>
          
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Distribution</div>
            <div className="text-base font-bold">Quarterly</div>
          </div>
          
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Term</div>
            <div className="text-base font-bold">{term} years</div>
          </div>
          
          <Button 
            className="w-full" 
            onClick={onInvest}
          >
            Invest Now
          </Button>
          
          <p className="text-xs text-gray-500 text-center">
            Investment opportunities involve risk, including the possible loss of principal.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
