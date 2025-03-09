
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { FirecrawlService } from "@/utils/FirecrawlService";

interface OpenAIApiKeySetupProps {
  onApiKeyValidated: () => void;
}

export const OpenAIApiKeySetup = ({ onApiKeyValidated }: OpenAIApiKeySetupProps) => {
  const { toast } = useToast();
  const [openAIApiKey, setOpenAIApiKey] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSaveOpenAIApiKey = async () => {
    if (!openAIApiKey.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid OpenAI API key",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const isValid = await FirecrawlService.testOpenAIApiKey(openAIApiKey);
      if (isValid) {
        FirecrawlService.saveOpenAIApiKey(openAIApiKey);
        setIsLoading(false);
        toast({
          title: "Success",
          description: "OpenAI API key saved successfully",
        });
        onApiKeyValidated();
      } else {
        toast({
          title: "Error",
          description: "Invalid OpenAI API key",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to validate OpenAI API key",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Collapsible className="mb-4">
      <CollapsibleTrigger asChild>
        <div className="bg-blue-50 p-3 rounded-md flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-blue-600" />
            <p className="text-sm text-blue-700">Add AI-powered analysis</p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs">Setup</Button>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="border p-3 rounded-md space-y-3">
          <p className="text-sm text-gray-600">
            Add your OpenAI API key to get AI-powered analysis of market data.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Enter OpenAI API key"
              value={openAIApiKey}
              onChange={(e) => setOpenAIApiKey(e.target.value)}
              className="flex-grow"
            />
            <Button 
              onClick={handleSaveOpenAIApiKey} 
              disabled={isLoading}
              size="sm"
            >
              Save
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Your API key is stored locally in your browser and never sent to our servers.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
