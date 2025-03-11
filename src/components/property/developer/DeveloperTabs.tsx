
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeveloperOverviewTab } from './DeveloperOverviewTab';
import { DeveloperProjectsTab } from './DeveloperProjectsTab';
import { DeveloperPerformanceTab } from './DeveloperPerformanceTab';
import { DeveloperRisksTab } from './DeveloperRisksTab';
import { DeveloperMediaTab } from './DeveloperMediaTab';
import { Developer } from '@/data/developers';
import { useIsMobile } from "@/hooks/use-mobile";

interface DeveloperTabsProps {
  developer: Developer;
}

export const DeveloperTabs = ({ developer }: DeveloperTabsProps) => {
  const isMobile = useIsMobile();
  
  return (
    <Tabs defaultValue="overview" className="mt-4 animate-fade-in">
      <div className="relative overflow-x-auto pb-2 -mx-2 px-2">
        <TabsList className="flex w-full h-auto rounded-lg p-1 bg-gray-100/70 shadow-inner transition-all duration-300 hover:shadow-sm">
          <TabsTrigger 
            value="overview" 
            className="text-xs py-1 px-2 rounded-md flex-1 max-w-[90px] transition-all duration-300 
                     data-[state=active]:shadow-[0_0_8px_rgba(66,133,244,0.25)] data-[state=active]:bg-white
                     hover:bg-blue-50/50 data-[state=active]:hover:bg-white"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger 
            value="projects" 
            className="text-xs py-1 px-2 rounded-md flex-1 max-w-[90px] transition-all duration-300 
                     data-[state=active]:shadow-[0_0_8px_rgba(66,133,244,0.25)] data-[state=active]:bg-white
                     hover:bg-blue-50/50 data-[state=active]:hover:bg-white"
          >
            Projects
          </TabsTrigger>
          <TabsTrigger 
            value="performance" 
            className="text-xs py-1 px-2 rounded-md flex-1 max-w-[90px] transition-all duration-300 
                     data-[state=active]:shadow-[0_0_8px_rgba(66,133,244,0.25)] data-[state=active]:bg-white
                     hover:bg-blue-50/50 data-[state=active]:hover:bg-white"
          >
            Performance
          </TabsTrigger>
          <TabsTrigger 
            value="risk" 
            className="text-xs py-1 px-2 rounded-md flex-1 max-w-[90px] transition-all duration-300 
                     data-[state=active]:shadow-[0_0_8px_rgba(66,133,244,0.25)] data-[state=active]:bg-white
                     hover:bg-blue-50/50 data-[state=active]:hover:bg-white"
          >
            Risk
          </TabsTrigger>
          <TabsTrigger 
            value="media" 
            className="text-xs py-1 px-2 rounded-md flex-1 max-w-[90px] transition-all duration-300 
                     data-[state=active]:shadow-[0_0_8px_rgba(66,133,244,0.25)] data-[state=active]:bg-white
                     hover:bg-blue-50/50 data-[state=active]:hover:bg-white"
          >
            Media
          </TabsTrigger>
        </TabsList>
        
        {/* Active tab indicator with animation */}
        <div className="mt-1 mx-auto w-16 h-0.5 bg-gradient-to-r from-blue-300/0 via-blue-400/40 to-blue-300/0 rounded-full"></div>
      </div>
      
      <TabsContent value="overview" className="animate-fade-in">
        <DeveloperOverviewTab developer={developer} />
      </TabsContent>
      
      <TabsContent value="projects" className="animate-fade-in">
        <DeveloperProjectsTab developer={developer} />
      </TabsContent>
      
      <TabsContent value="performance" className="animate-fade-in">
        <DeveloperPerformanceTab developer={developer} />
      </TabsContent>
      
      <TabsContent value="risk" className="animate-fade-in">
        <DeveloperRisksTab developer={developer} />
      </TabsContent>
      
      <TabsContent value="media" className="animate-fade-in">
        <DeveloperMediaTab developer={developer} />
      </TabsContent>
    </Tabs>
  );
};
