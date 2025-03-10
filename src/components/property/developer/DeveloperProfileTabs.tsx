
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building, Users, BarChart, FileText, AlertTriangle } from "lucide-react";
import { DeveloperOverview } from "./DeveloperOverview";
import { DeveloperPerformance } from "./DeveloperPerformance";
import { DeveloperProjects } from "./DeveloperProjects";
import { DeveloperMedia } from "./DeveloperMedia";
import { DeveloperRisks } from "./DeveloperRisks";
import { Developer } from "@/data/developerData";

interface DeveloperProfileTabsProps {
  developer: Developer;
}

export const DeveloperProfileTabs = ({ developer }: DeveloperProfileTabsProps) => {
  const [activeTab, setActiveTab] = useState("overview");
  
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <div className="px-6 pt-4 border-b">
        <TabsList className="grid w-full sm:w-auto sm:inline-grid grid-cols-2 sm:grid-cols-5 h-auto gap-2">
          <TabsTrigger value="overview" className="px-3 py-2">
            <Building className="w-4 h-4 mr-2 sm:mr-0 md:mr-2" />
            <span className="hidden sm:inline-block md:inline-block">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="px-3 py-2">
            <BarChart className="w-4 h-4 mr-2 sm:mr-0 md:mr-2" />
            <span className="hidden sm:inline-block md:inline-block">Performance</span>
          </TabsTrigger>
          <TabsTrigger value="projects" className="px-3 py-2">
            <Building className="w-4 h-4 mr-2 sm:mr-0 md:mr-2" />
            <span className="hidden sm:inline-block md:inline-block">Projects</span>
          </TabsTrigger>
          <TabsTrigger value="media" className="px-3 py-2">
            <FileText className="w-4 h-4 mr-2 sm:mr-0 md:mr-2" />
            <span className="hidden sm:inline-block md:inline-block">Media</span>
          </TabsTrigger>
          <TabsTrigger value="risks" className="px-3 py-2">
            <AlertTriangle className="w-4 h-4 mr-2 sm:mr-0 md:mr-2" />
            <span className="hidden sm:inline-block md:inline-block">Risks</span>
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="p-6">
        <TabsContent value="overview" className="mt-0">
          <DeveloperOverview developer={developer} />
        </TabsContent>

        <TabsContent value="performance" className="mt-0">
          <DeveloperPerformance performanceData={developer.performanceData} />
        </TabsContent>

        <TabsContent value="projects" className="mt-0">
          <DeveloperProjects pastProjects={developer.pastProjects} />
        </TabsContent>

        <TabsContent value="media" className="mt-0">
          <DeveloperMedia mediaArticles={developer.mediaArticles} />
        </TabsContent>

        <TabsContent value="risks" className="mt-0">
          <DeveloperRisks 
            riskFactors={developer.riskFactors} 
            legalHistory={developer.legalHistory} 
          />
        </TabsContent>
      </div>
    </Tabs>
  );
};
