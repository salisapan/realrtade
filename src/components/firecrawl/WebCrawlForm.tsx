import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Card, 
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle 
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, LinkIcon, Search, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FirecrawlService } from "@/utils/FirecrawlService";

export const WebCrawlForm = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState(localStorage.getItem("firecrawlApiKey") || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [maxPages, setMaxPages] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCrawl = async () => {
    if (!apiKey) {
      setError("Please enter a Firecrawl API key");
      toast({
        title: "API Key Required",
        description: "Please enter your Firecrawl API key to proceed.",
        variant: "destructive",
      });
      return;
    }

    if (!url) {
      setError("Please enter a URL to crawl");
      toast({
        description: "Please enter a URL to crawl",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setResults(null);
      
      // Save API key for future use
      localStorage.setItem("firecrawlApiKey", apiKey);
      
      // Use the static method instead of creating an instance
      FirecrawlService.saveApiKey(apiKey);
      
      // Start crawling
      toast({
        title: "Crawling Started",
        description: "This may take a few minutes depending on website size.",
      });

      const response = await FirecrawlService.crawlWebsite(url);
      
      setResults(response);
      
      toast({
        title: "Crawl Complete",
        description: `Successfully crawled ${response.data?.completed || 0} pages`,
        variant: "success",
      });
    } catch (err) {
      console.error("Crawl error:", err);
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      toast({
        title: "Crawl Failed",
        description: err instanceof Error ? err.message : "An error occurred during crawling",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Web Crawler Configuration</CardTitle>
          <CardDescription>
            Configure your web crawling parameters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">Firecrawl API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="Enter your Firecrawl API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Get your API key from <a href="https://firecrawl.dev" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">firecrawl.dev</a>
            </p>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <Label htmlFor="url">Website URL</Label>
            <div className="flex gap-2">
              <div className="relative flex-grow">
                <LinkIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="url"
                  placeholder="https://example.com"
                  className="pl-8"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <Button onClick={handleCrawl} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Crawling...
                  </>
                ) : (
                  <>
                    <Globe className="mr-2 h-4 w-4" />
                    Start Crawl
                  </>
                )}
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="search-query">Search Query (Optional)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="search-query"
                placeholder="Enter a search query to analyze the content"
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Provide a natural language query to analyze the crawled content
            </p>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label htmlFor="max-pages">Maximum Pages</Label>
              <span className="text-sm text-muted-foreground">{maxPages} pages</span>
            </div>
            <Slider
              id="max-pages"
              defaultValue={[maxPages]}
              min={1}
              max={50}
              step={1}
              onValueChange={(value) => setMaxPages(value[0])}
              disabled={isLoading}
            />
            <p className="text-sm text-muted-foreground">
              Limit how many pages to crawl (higher values take longer)
            </p>
          </div>
        </CardContent>
      </Card>
      
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Crawl Results</CardTitle>
            <CardDescription>
              Found {results.data?.completed || 0} pages from {url}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto space-y-4">
              {results.data?.completed > 0 ? (
                results.data.results.map((page: any, index: number) => (
                  <div key={index} className="border rounded-md p-4">
                    <h3 className="font-medium mb-1 truncate">
                      <a href={page.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {page.title || page.url}
                      </a>
                    </h3>
                    <p className="text-sm text-muted-foreground mb-2">{page.url}</p>
                    {searchQuery ? (
                      <>
                        <p className="text-sm mb-1"><strong>Relevance Score:</strong> {(page.score * 100).toFixed(0)}%</p>
                        <div className="bg-gray-50 p-2 rounded text-sm">
                          <strong>Excerpt:</strong> {page.excerpt || "No excerpt available"}
                        </div>
                      </>
                    ) : (
                      <Textarea
                        value={page.content?.substring(0, 200) + "..." || "No content available"}
                        readOnly
                        className="text-sm h-20"
                      />
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No results found. Try adjusting your search parameters.
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <p className="text-sm text-muted-foreground">
              Crawl ID: {results.crawlId}
            </p>
            <Button variant="outline" onClick={() => setResults(null)}>
              Clear Results
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};
