
import { AlertTriangle } from "lucide-react";

interface DeveloperRisksProps {
  riskFactors: string[];
  legalHistory: string;
}

export const DeveloperRisks = ({ riskFactors, legalHistory }: DeveloperRisksProps) => {
  return (
    <div>
      <h3 className="text-lg font-medium mb-4">Risk Assessment</h3>
      <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4 mb-4">
        <div className="flex items-start">
          <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 mr-2" />
          <div>
            <h4 className="font-medium text-yellow-800">Risk Disclosure</h4>
            <p className="text-yellow-700 text-sm mt-1">
              All investments carry risks. Please review the following risk factors before investing
              with this developer. Past performance does not guarantee future results.
            </p>
          </div>
        </div>
      </div>
      
      <div className="space-y-4">
        {riskFactors.map((risk, index) => (
          <div key={index} className="flex items-start">
            <div className="bg-gray-100 p-1 rounded-full mr-3 mt-0.5">
              <AlertTriangle className="w-4 h-4 text-gray-500" />
            </div>
            <div>
              <p className="text-gray-700">{risk}</p>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-6 bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium mb-2">Legal History</h4>
        <p className="text-gray-700">{legalHistory}</p>
      </div>
    </div>
  );
};
