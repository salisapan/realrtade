
import { MapPin, Star } from "lucide-react";

interface DeveloperProfileHeaderProps {
  developer: {
    name: string;
    rating: number;
    location: string;
    foundedYear: number;
    completedProjects: number;
    teamSize: string;
  };
}

export const DeveloperProfileHeader = ({ developer }: DeveloperProfileHeaderProps) => {
  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) {
        stars.push(<Star key={i} className="fill-yellow-400 text-yellow-400 w-4 h-4" />);
      } else if (i === fullStars + 1 && hasHalfStar) {
        stars.push(<Star key={i} className="fill-yellow-400 text-yellow-400 w-4 h-4 fill-[50%]" />);
      } else {
        stars.push(<Star key={i} className="text-gray-300 w-4 h-4" />);
      }
    }
    
    return stars;
  };

  return (
    <div className="p-6 border-b bg-gray-50">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold">{developer.name}</h2>
          <div className="flex items-center mt-1 gap-2">
            <div className="flex items-center">
              {renderStars(developer.rating)}
              <span className="ml-2 text-sm font-medium">{developer.rating}/5</span>
            </div>
            <span className="text-gray-500 text-sm">•</span>
            <div className="flex items-center text-gray-500 text-sm">
              <MapPin className="w-3 h-3 mr-1" />
              {developer.location}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex flex-col items-center">
            <span className="font-medium">{developer.foundedYear}</span>
            <span className="text-gray-500 text-xs">Founded</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="font-medium">{developer.completedProjects}</span>
            <span className="text-gray-500 text-xs">Projects</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="font-medium">{developer.teamSize}</span>
            <span className="text-gray-500 text-xs">Team</span>
          </div>
        </div>
      </div>
    </div>
  );
};
