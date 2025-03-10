
import React from 'react';
import { FileText } from "lucide-react";
import { Developer } from '@/data/developers';

interface DeveloperMediaTabProps {
  developer: Developer;
}

export const DeveloperMediaTab = ({ developer }: DeveloperMediaTabProps) => {
  return (
    <div className="pt-4 block">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-3">Recent Media Coverage</h3>
          <div className="space-y-3">
            {developer.mediaArticles.map((article, index) => (
              <div key={index} className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-start">
                  <FileText className="w-4 h-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-medium">{article.title}</h4>
                    <div className="flex items-center mt-1">
                      <span className="text-xs text-gray-500">{article.source}</span>
                      <span className="mx-1 text-gray-300">•</span>
                      <span className="text-xs text-gray-500">{article.date}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-right">
                  <a 
                    href={article.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Read Article
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <h3 className="text-sm font-semibold mb-3">Legal History</h3>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm">{developer.legalHistory}</p>
          </div>
          
          <h3 className="text-sm font-semibold mb-3 mt-4">Compliance Record</h3>
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm">Regulatory Compliance</span>
              <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                Excellent
              </span>
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm">Legal Disputes</span>
              <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                Minimal
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Environmental Compliance</span>
              <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                Excellent
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
