
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
    <Tabs defaultValue="overview" className="mt-4">
      <div className="relative overflow-x-auto pb-2 -mx-2 px-2">
        <TabsList className={`flex w-full h-auto rounded-lg p-1 ${isMobile ? 'flex-wrap gap-1 justify-center' : ''}`}>
          <TabsTrigger 
            value="overview" 
            className="text-xs py-1.5 px-3 rounded-md flex-1 max-w-[110px]"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger 
            value="projects" 
            className="text-xs py-1.5 px-3 rounded-md flex-1 max-w-[110px]"
          >
            Past Projects
          </TabsTrigger>
          <TabsTrigger 
            value="performance" 
            className="text-xs py-1.5 px-3 rounded-md flex-1 max-w-[110px]"
          >
            Performance
          </TabsTrigger>
          <TabsTrigger 
            value="risk" 
            className="text-xs py-1.5 px-3 rounded-md flex-1 max-w-[110px]"
          >
            Risk Factors
          </TabsTrigger>
          <TabsTrigger 
            value="media" 
            className="text-xs py-1.5 px-3 rounded-md flex-1 max-w-[110px]"
          >
            Media & Legal
          </TabsTrigger>
        </TabsList>
      </div>
      
      <TabsContent value="overview">
        <DeveloperOverviewTab developer={developer} />
      </TabsContent>
      
      <TabsContent value="projects">
        <DeveloperProjectsTab developer={developer} />
      </TabsContent>
      
      <TabsContent value="performance">
        <DeveloperPerformanceTab developer={developer} />
      </TabsContent>
      
      <TabsContent value="risk">
        <DeveloperRisksTab developer={developer} />
      </TabsContent>
      
      <TabsContent value="media">
        <DeveloperMediaTab developer={developer} />
      </TabsContent>
    </Tabs>
  );
};
