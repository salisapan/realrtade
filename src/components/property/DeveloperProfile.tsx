
import { Card } from "@/components/ui/card";
import { DeveloperProfileHeader } from "./developer/DeveloperProfileHeader";
import { DeveloperProfileTabs } from "./developer/DeveloperProfileTabs";
import { Developer } from "@/data/developerData";

interface DeveloperProfileProps {
  developer: Developer;
}

export const DeveloperProfile = ({ developer }: DeveloperProfileProps) => {
  return (
    <Card className="w-full overflow-hidden border">
      <DeveloperProfileHeader developer={developer} />
      <DeveloperProfileTabs developer={developer} />
    </Card>
  );
};
