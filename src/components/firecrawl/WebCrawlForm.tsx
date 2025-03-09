
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Globe, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FirecrawlService } from "@/utils/FirecrawlService";
import { Progress } from "@/components/ui/progress";

interface CrawlResult {
  success: boolean;
  status?: string;
  completed?: number;
  total?: number;
  creditsUsed?: number;
  expiresAt?: string;
  data?: any[];
}

export const WebCrawlForm = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isApiKeySet, setIsApiKeySet] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState(0);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);

  // Check if API key exists on component mount
  useState(() => {
    const savedApiKey = FirecrawlService.getApiKey();
    if (savedApiKey) {
      setIsApiKeySet(true);
    }
  });

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
        setIsApiKeySet(true);
        toast({
          title: "Success",
          description: "API key saved successfully",
        });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    setProgress(0);
    setCrawlResult(null);
    
    // Simulate progress for better UX
    const progressInterval = setInterval(() => {
      setProgress((prev) => (prev >= 90 ? 90 : prev + 10));
    }, 1000);
    
    try {
      const result = await FirecrawlService.crawlWebsite(url);
      
      if (result.success && result.data) {
        setCrawlResult(result.data);
        toast({
          title: "Success",
          description: "Website crawled successfully",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to crawl website",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      clearInterval(progressInterval);
      setProgress(100);
      setIsLoading(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          Web Crawler
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!isApiKeySet ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Enter your Firecrawl API key to start crawling websites.
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
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
                Website URL
              </label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                disabled={isLoading}
                required
              />
            </div>
            
            {isLoading && (
              <div className="space-y-2">
                <Progress value={progress} className="w-full h-2" />
                <p className="text-xs text-gray-500 text-center">Crawling website... {progress}%</p>
              </div>
            )}
            
            <Button 
              type="submit" 
              disabled={isLoading} 
              className="w-full"
            >
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {isLoading ? "Crawling..." : "Start Crawl"}
            </Button>
          </form>
        )}

        {crawlResult && (
          <div className="mt-6 p-4 bg-gray-50 rounded-md">
            <h3 className="text-md font-semibold mb-2">Crawl Results</h3>
            <div className="space-y-2 text-sm">
              <p>Status: <span className="font-medium">{crawlResult.status}</span></p>
              <p>Pages: <span className="font-medium">{crawlResult.completed} / {crawlResult.total}</span></p>
              <p>Credits Used: <span className="font-medium">{crawlResult.creditsUsed}</span></p>
              
              {crawlResult.data && crawlResult.data.length > 0 && (
                <div className="mt-4">
                  <p className="font-medium mb-2">Found {crawlResult.data.length} pages:</p>
                  <div className="max-h-60 overflow-y-auto mt-2 border rounded-md">
                    {crawlResult.data.map((item: any, index: number) => (
                      <div key={index} className="p-2 border-b text-xs">
                        <p className="font-medium truncate">{item.url}</p>
                        <p className="text-gray-500 truncate">Title: {item.title || 'N/A'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
