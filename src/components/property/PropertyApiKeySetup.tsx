
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FirecrawlService } from "@/utils/FirecrawlService";

interface PropertyApiKeySetupProps {
  onApiKeyValidated: () => void;
}

export const PropertyApiKeySetup = ({ onApiKeyValidated }: PropertyApiKeySetupProps) => {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid API key",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const isValid = await FirecrawlService.testApiKey(apiKey);
      if (isValid) {
        FirecrawlService.saveApiKey(apiKey);
        toast({
          title: "Success",
          description: "API key saved successfully",
        });
        onApiKeyValidated();
      } else {
        toast({
          title: "Error",
          description: "Invalid API key",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to validate API key",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Enter your Firecrawl API key to fetch real-time market data for this property.
      </p>
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder="Enter Firecrawl API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="flex-grow"
        />
        <Button 
          onClick={handleSaveApiKey} 
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Save Key
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        Get your API key from <a href="https://firecrawl.dev" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Firecrawl.dev</a>
      </p>
    </div>
  );
};
