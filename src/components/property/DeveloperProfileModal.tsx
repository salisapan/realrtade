
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
          className="p-0 h-auto flex items-center gap-1 text-gray-800 hover:text-primary group"
        >
          <span className="group-hover:text-primary transition-colors duration-300">{developer.name}</span>
          <span className="text-yellow-500 text-sm ml-1 group-hover:scale-110 transition-transform duration-300">★ {developer.rating}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-4 md:p-6 shadow-[0_0_15px_rgba(66,133,244,0.25)] animate-fade-in bg-gradient-to-b from-white to-gray-50">
        <div className="animate-fade-in transition-all duration-300">
          <DeveloperProfileHeader developer={developer} />
          <div className="mt-2 rounded-lg p-1 bg-gray-100/70 shadow-inner">
            <DeveloperTabs developer={developer} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
