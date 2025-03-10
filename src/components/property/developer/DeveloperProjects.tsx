
import { MapPin } from "lucide-react";

interface DeveloperProjectsProps {
  pastProjects: {
    name: string;
    year: number;
    roi: number;
    location: string;
  }[];
}

export const DeveloperProjects = ({ pastProjects }: DeveloperProjectsProps) => {
  return (
    <div>
      <h3 className="text-lg font-medium mb-4">Past Projects</h3>
      <div className="space-y-4">
        {pastProjects.map((project, index) => (
          <div key={index} className="border rounded-lg overflow-hidden">
            <div className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium">{project.name}</h4>
                  <div className="flex items-center text-sm text-gray-500 mt-1">
                    <MapPin className="w-3 h-3 mr-1" />
                    <span>{project.location}</span>
                    <span className="mx-2">•</span>
                    <span>{project.year}</span>
                  </div>
                </div>
                <div className="bg-blue-50 text-blue-700 font-medium px-2 py-1 rounded text-sm">
                  {project.roi}% ROI
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
