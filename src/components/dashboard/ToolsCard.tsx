
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, LineChart } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const ToolsCard = () => {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base md:text-lg">Tools & Resources</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 md:space-y-4">
          <Button 
            variant="outline" 
            className="w-full justify-start text-left h-auto py-2 md:py-3 px-3 md:px-4"
            onClick={() => navigate("/reports")}
          >
            <div className="flex items-start gap-2 md:gap-3">
              <FileText className="h-4 w-4 md:h-5 md:w-5 text-green-500 mt-0.5" />
              <div>
                <h3 className="font-medium text-sm md:text-base mb-0 md:mb-1">Property Reports</h3>
                <p className="text-xs md:text-sm text-gray-500">View detailed analytics on your investments</p>
              </div>
            </div>
          </Button>

          <Button 
            variant="outline" 
            className="w-full justify-start text-left h-auto py-2 md:py-3 px-3 md:px-4"
            onClick={() => navigate("/performance")}
          >
            <div className="flex items-start gap-2 md:gap-3">
              <LineChart className="h-4 w-4 md:h-5 md:w-5 text-blue-500 mt-0.5" />
              <div>
                <h3 className="font-medium text-sm md:text-base mb-0 md:mb-1">Investment Analysis</h3>
                <p className="text-xs md:text-sm text-gray-500">Track performance across your portfolio</p>
              </div>
            </div>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
