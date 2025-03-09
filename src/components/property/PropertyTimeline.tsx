
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";

interface PropertyTimelineProps {
  property: {
    fundingEndDate: string;
    acquisitionDate: string;
    firstDistributionDate: string;
    exitDate: string;
  };
}

export const PropertyTimeline = ({ property }: PropertyTimelineProps) => {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">1</div>
              <div className="w-0.5 h-full bg-gray-200 mt-1"></div>
            </div>
            <div>
              <h3 className="text-sm font-medium">Funding Phase</h3>
              <p className="text-xs text-gray-500 mb-0.5">In Progress</p>
              <div className="flex items-center text-xs text-gray-500">
                <CalendarDays className="w-3 h-3 mr-1" />
                <span>Ends {property.fundingEndDate}</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs">2</div>
              <div className="w-0.5 h-full bg-gray-200 mt-1"></div>
            </div>
            <div>
              <h3 className="text-sm font-medium">Acquisition</h3>
              <p className="text-xs text-gray-500 mb-0.5">Planned</p>
              <div className="flex items-center text-xs text-gray-500">
                <CalendarDays className="w-3 h-3 mr-1" />
                <span>Expected {property.acquisitionDate}</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs">3</div>
              <div className="w-0.5 h-full bg-gray-200 mt-1"></div>
            </div>
            <div>
              <h3 className="text-sm font-medium">First Distribution</h3>
              <p className="text-xs text-gray-500 mb-0.5">Planned</p>
              <div className="flex items-center text-xs text-gray-500">
                <CalendarDays className="w-3 h-3 mr-1" />
                <span>Expected {property.firstDistributionDate}</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs">4</div>
            </div>
            <div>
              <h3 className="text-sm font-medium">Exit Strategy</h3>
              <p className="text-xs text-gray-500 mb-0.5">Planned</p>
              <div className="flex items-center text-xs text-gray-500">
                <CalendarDays className="w-3 h-3 mr-1" />
                <span>Expected {property.exitDate}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
