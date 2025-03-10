
import React from 'react';
import { BarChart } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Developer } from '@/data/developers';

interface DeveloperPerformanceTabProps {
  developer: Developer;
}

export const DeveloperPerformanceTab = ({ developer }: DeveloperPerformanceTabProps) => {
  return (
    <div className="pt-4 block">
      <h3 className="text-sm font-semibold mb-3">Annual ROI Performance</h3>
      <div className="h-64 bg-gray-50 p-3 rounded-lg">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={developer.performanceData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="roi" 
              name="ROI %" 
              stroke="#1A2E5A" 
              fill="#1A2E5A" 
              fillOpacity={0.3} 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 bg-gray-50 p-3 rounded-lg">
        <div className="flex items-center mb-2">
          <BarChart className="w-4 h-4 text-primary mr-2" />
          <h4 className="text-sm font-medium">Key Performance Indicators</h4>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm">Average ROI</span>
            <span className="font-medium">
              {(developer.performanceData.reduce((acc, curr) => acc + curr.roi, 0) / developer.performanceData.length).toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Latest ROI</span>
            <span className="font-medium">
              {developer.performanceData[developer.performanceData.length - 1].roi}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Projects Delivered On Time</span>
            <span className="font-medium">95%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
