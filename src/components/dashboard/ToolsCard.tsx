
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, LineChart } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const ToolsCard = () => {
  const navigate = useNavigate();

  return (
    <Card className="bg-gray-800/50 backdrop-blur-md border border-gray-700 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
      <CardHeader>
        <CardTitle className="text-base md:text-lg text-white">Tools & Resources</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 md:space-y-4">
          <Button 
            variant="outline" 
            className="w-full justify-start text-left h-auto py-2 md:py-3 px-3 md:px-4 bg-gray-800/70 border border-gray-700 text-gray-100 hover:bg-gray-700/50 hover:text-white hover:shadow-[0_0_10px_rgba(59,130,246,0.3)] transition-all duration-300"
            onClick={() => navigate("/reports")}
          >
            <div className="flex items-start gap-2 md:gap-3">
              <div className="p-1.5 rounded-md bg-green-900/40 text-green-400">
                <FileText className="h-4 w-4 md:h-5 md:w-5" />
              </div>
              <div>
                <h3 className="font-medium text-sm md:text-base mb-0 md:mb-1 text-gray-100">Property Reports</h3>
                <p className="text-xs md:text-sm text-gray-400">View detailed analytics on your investments</p>
              </div>
            </div>
          </Button>

          <Button 
            variant="outline" 
            className="w-full justify-start text-left h-auto py-2 md:py-3 px-3 md:px-4 bg-gray-800/70 border border-gray-700 text-gray-100 hover:bg-gray-700/50 hover:text-white hover:shadow-[0_0_10px_rgba(59,130,246,0.3)] transition-all duration-300"
            onClick={() => navigate("/performance")}
          >
            <div className="flex items-start gap-2 md:gap-3">
              <div className="p-1.5 rounded-md bg-blue-900/40 text-blue-400">
                <LineChart className="h-4 w-4 md:h-5 md:w-5" />
              </div>
              <div>
                <h3 className="font-medium text-sm md:text-base mb-0 md:mb-1 text-gray-100">Investment Analysis</h3>
                <p className="text-xs md:text-sm text-gray-400">Track performance across your portfolio</p>
              </div>
            </div>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
