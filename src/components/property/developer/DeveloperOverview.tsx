
import { Building, Users } from "lucide-react";

interface DeveloperOverviewProps {
  developer: {
    bio: string;
    foundedYear: number;
    location: string;
    teamSize: string;
    completedProjects: number;
    performanceData: {
      year: string;
      roi: number;
    }[];
  };
}

export const DeveloperOverview = ({ developer }: DeveloperOverviewProps) => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">About {developer.name}</h3>
        <p className="text-gray-700">{developer.bio}</p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium flex items-center"><Users className="w-4 h-4 mr-2" /> Company Details</h4>
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
          <h4 className="font-medium flex items-center"><Building className="w-4 h-4 mr-2" /> Track Record</h4>
          <div className="mt-2 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Completed Projects</span>
              <span>{developer.completedProjects}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Average ROI</span>
              <span>{developer.performanceData.reduce((acc, curr) => acc + curr.roi, 0) / developer.performanceData.length}%</span>
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
