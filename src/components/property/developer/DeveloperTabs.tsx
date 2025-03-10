
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
      {/* Custom mobile-friendly tabs layout */}
      <div className="relative overflow-x-auto pb-2 -mx-2 px-2">
        <TabsList className={`grid w-full h-auto ${isMobile ? 'grid-cols-2 gap-1' : 'grid-cols-5'}`}>
          {isMobile ? (
            <>
              <div className="contents">
                <TabsTrigger value="overview" className="text-xs py-2 px-1">Overview</TabsTrigger>
                <TabsTrigger value="projects" className="text-xs py-2 px-1">Past Projects</TabsTrigger>
              </div>
              <div className="contents">
                <TabsTrigger value="performance" className="text-xs py-2 px-1">Performance</TabsTrigger>
                <TabsTrigger value="risk" className="text-xs py-2 px-1">Risk Factors</TabsTrigger>
              </div>
              <div className="col-span-2 mt-1">
                <TabsTrigger value="media" className="text-xs py-2 w-full">Media & Legal</TabsTrigger>
              </div>
            </>
          ) : (
            <>
              <TabsTrigger value="overview" className="text-xs py-2">Overview</TabsTrigger>
              <TabsTrigger value="projects" className="text-xs py-2">Past Projects</TabsTrigger>
              <TabsTrigger value="performance" className="text-xs py-2">Performance</TabsTrigger>
              <TabsTrigger value="risk" className="text-xs py-2">Risk Factors</TabsTrigger>
              <TabsTrigger value="media" className="text-xs py-2">Media & Legal</TabsTrigger>
            </>
          )}
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
