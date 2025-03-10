
import React from 'react';
import { ShieldAlert } from "lucide-react";
import { Developer } from '@/data/developers';

interface DeveloperRisksTabProps {
  developer: Developer;
}

export const DeveloperRisksTab = ({ developer }: DeveloperRisksTabProps) => {
  return (
    <div className="pt-4 block">
      <h3 className="text-sm font-semibold mb-3">Risk Assessment</h3>
      <div className="space-y-3">
        {developer.riskFactors.map((risk, index) => (
          <div key={index} className="flex items-start p-3 bg-gray-50 rounded-lg">
            <ShieldAlert className="w-4 h-4 text-amber-500 mr-2 mt-0.5 flex-shrink-0" />
            <p className="text-sm">{risk}</p>
          </div>
        ))}
      </div>
      
      <div className="mt-4 bg-gray-50 p-3 rounded-lg">
        <h3 className="text-sm font-semibold mb-2">Risk Mitigation Strategies</h3>
        <ul className="text-sm space-y-2">
          <li className="flex items-start">
            <span className="text-primary mr-2">•</span>
            <span>Strict due diligence process for all investments</span>
          </li>
          <li className="flex items-start">
            <span className="text-primary mr-2">•</span>
            <span>Diversified project portfolio across multiple markets</span>
          </li>
          <li className="flex items-start">
            <span className="text-primary mr-2">•</span>
            <span>Conservative underwriting standards</span>
          </li>
          <li className="flex items-start">
            <span className="text-primary mr-2">•</span>
            <span>Experienced management team with market downturns experience</span>
          </li>
        </ul>
      </div>
    </div>
  );
};
