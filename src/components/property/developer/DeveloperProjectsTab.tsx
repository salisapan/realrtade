
import React from 'react';
import { BarChart } from "lucide-react";
import { Developer } from '@/data/developers';

interface DeveloperProjectsTabProps {
  developer: Developer;
}

export const DeveloperProjectsTab = ({ developer }: DeveloperProjectsTabProps) => {
  return (
    <div className="pt-4 block">
      <h3 className="text-sm font-semibold mb-3">Past Project History</h3>
      <div className="space-y-3">
        {developer.pastProjects.map((project, index) => (
          <div key={index} className="bg-gray-50 p-3 rounded-lg">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-medium text-sm">{project.name}</h4>
                <p className="text-xs text-gray-500">{project.location}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500">Completed</span>
                <p className="font-medium">{project.year}</p>
              </div>
            </div>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
              <div className="flex items-center">
                <BarChart className="w-3 h-3 text-primary mr-1" />
                <span className="text-xs">ROI</span>
              </div>
              <span className="font-medium text-sm">{project.roi}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
