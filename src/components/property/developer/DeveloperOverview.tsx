
import { Building, Users } from "lucide-react";
import { Developer } from "@/data/developers/types";

interface DeveloperOverviewProps {
  developer: Developer;
}

export const DeveloperOverview = ({ developer }: DeveloperOverviewProps) => {
  // Calculate average ROI and format it to one decimal place
  const averageROI = developer.performanceData.reduce((acc, curr) => acc + curr.roi, 0) / developer.performanceData.length;
  const formattedROI = averageROI.toFixed(1);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">About {developer.name}</h3>
        <p className="text-gray-700">{developer.bio}</p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium flex items-center">
            <Users className="w-4 h-4 mr-2" /> Company Details
          </h4>
          <div className="mt-2 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Founded</span>
              <span>{developer.foundedYear}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Location</span>
              <span>{developer.location}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Team Size</span>
              <span>{developer.teamSize}</span>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium flex items-center">
            <Building className="w-4 h-4 mr-2" /> Track Record
          </h4>
          <div className="mt-2 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Completed Projects</span>
              <span>{developer.completedProjects}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Average ROI</span>
              <span>{formattedROI}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Legal History</span>
              <span>Clean</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
