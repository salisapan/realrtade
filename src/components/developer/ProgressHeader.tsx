
import React from 'react';
import { CardDescription, CardTitle } from "@/components/ui/card";

interface ProgressHeaderProps {
  step: number;
  totalSteps: number;
}

const ProgressHeader: React.FC<ProgressHeaderProps> = ({ step, totalSteps }) => {
  return (
    <div className="relative bg-primary text-white p-6">
      <div className="flex justify-between items-center">
        <CardTitle className="text-2xl">Developer Registration</CardTitle>
        <div className="text-sm">Step {step} of {totalSteps}</div>
      </div>
      <CardDescription className="text-blue-100">
        Join REALTRADE as a verified real estate developer
      </CardDescription>
      <div className="w-full bg-white/20 h-2 mt-4 rounded-full overflow-hidden">
        <div 
          className="bg-white h-full rounded-full transition-all duration-500" 
          style={{ width: `${(step / totalSteps) * 100}%` }}
        ></div>
      </div>
    </div>
  );
};

export default ProgressHeader;
