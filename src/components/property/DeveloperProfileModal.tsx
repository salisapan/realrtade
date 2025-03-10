
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DeveloperProfile } from "./DeveloperProfile";
import { Button } from "@/components/ui/button";
import { UserRound } from "lucide-react";
import { Developer } from "@/data/developerData";

interface DeveloperProfileModalProps {
  developer: Developer;
  trigger?: React.ReactNode;
}

export const DeveloperProfileModal = ({ 
  developer,
  trigger
}: DeveloperProfileModalProps) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <UserRound className="h-4 w-4" />
            View Developer Profile
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DeveloperProfile developer={developer} />
      </DialogContent>
    </Dialog>
  );
};
