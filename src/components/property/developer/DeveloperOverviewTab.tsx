
import React from 'react';
import { Calendar, History, Users } from "lucide-react";
import { Developer } from '@/data/developers';

interface DeveloperOverviewTabProps {
  developer: Developer;
}

export const DeveloperOverviewTab = ({ developer }: DeveloperOverviewTabProps) => {
  return (
    <div className="pt-4 block">
      <div className="mb-4">
        <h3 className="text-sm font-semibold mb-2">About {developer.name}</h3>
        <p className="text-sm text-gray-700">{developer.bio}</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center mb-2">
            <Calendar className="w-4 h-4 text-primary mr-2" />
            <h4 className="text-sm font-medium">Founded</h4>
          </div>
          <p className="text-lg font-bold">{developer.foundedYear}</p>
          <p className="text-xs text-gray-500">
            {new Date().getFullYear() - developer.foundedYear} years in business
          </p>
        </div>
        
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center mb-2">
            <History className="w-4 h-4 text-primary mr-2" />
            <h4 className="text-sm font-medium">Completed Projects</h4>
          </div>
          <p className="text-lg font-bold">{developer.completedProjects}</p>
          <p className="text-xs text-gray-500">Successful developments</p>
        </div>
        
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center mb-2">
            <Users className="w-4 h-4 text-primary mr-2" />
            <h4 className="text-sm font-medium">Team Size</h4>
          </div>
          <p className="text-lg font-bold">{developer.teamSize}</p>
          <p className="text-xs text-gray-500">Development professionals</p>
        </div>
      </div>
    </div>
  );
};
