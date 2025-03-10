
import React from 'react';
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DeveloperProfileHeader } from './developer/DeveloperProfileHeader';
import { DeveloperTabs } from './developer/DeveloperTabs';
import { Developer } from '@/data/developers';

interface DeveloperProfileModalProps {
  developer: Developer;
}

export const DeveloperProfileModal = ({ developer }: DeveloperProfileModalProps) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="link" 
          className="p-0 h-auto flex items-center gap-1 text-gray-800 hover:text-primary"
        >
          <span>{developer.name}</span>
          <span className="text-yellow-500 text-sm ml-1">★ {developer.rating}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
        <DeveloperProfileHeader developer={developer} />
        <DeveloperTabs developer={developer} />
      </DialogContent>
    </Dialog>
  );
};
