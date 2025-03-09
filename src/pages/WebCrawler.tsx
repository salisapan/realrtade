
import { AppSidebar } from "@/components/AppSidebar";
import { WebCrawlForm } from "@/components/firecrawl/WebCrawlForm";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Code, BookOpen } from "lucide-react";

const WebCrawler = () => {
  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">Website Crawler</h1>
          <p className="mb-6 text-gray-600">
            Use this tool to crawl websites and extract data. Enter a URL to get started.
          </p>
          
          <Tabs defaultValue="crawler" className="mb-8">
            <TabsList className="grid w-full grid-cols-3 mb-8">
              <TabsTrigger value="crawler" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                <span>Web Crawler</span>
              </TabsTrigger>
              <TabsTrigger value="examples" className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                <span>Example Queries</span>
              </TabsTrigger>
              <TabsTrigger value="documentation" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                <span>Documentation</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="crawler">
              <WebCrawlForm />
            </TabsContent>
            
            <TabsContent value="examples">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <h3 className="text-lg font-medium mb-2">Example Search Queries</h3>
                  <div className="space-y-4">
                    <div className="border-l-4 border-blue-500 pl-4 py-2">
                      <h4 className="font-medium">Find pricing information</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        "What are the pricing plans and features for this service?"
                      </p>
                    </div>
                    
                    <div className="border-l-4 border-green-500 pl-4 py-2">
                      <h4 className="font-medium">Extract contact information</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        "Find all contact information including email, phone numbers and address"
                      </p>
                    </div>
                    
                    <div className="border-l-4 border-purple-500 pl-4 py-2">
                      <h4 className="font-medium">Research company background</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        "What is the company history, their team, and what products do they offer?"
                      </p>
                    </div>
                    
                    <div className="border-l-4 border-amber-500 pl-4 py-2">
                      <h4 className="font-medium">Gather investment information</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        "What investment opportunities does this company offer and what are the terms?"
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="documentation">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <h3 className="text-lg font-medium mb-2">How the Web Crawler Works</h3>
                  <p>
                    The web crawler uses the Firecrawl API to crawl websites and extract information. Here's how it works:
                  </p>
                  
                  <ol className="list-decimal ml-5 space-y-2">
                    <li>Enter the URL of the website you want to crawl</li>
                    <li>Optionally provide a search query to analyze the content</li>
                    <li>Set the maximum number of pages to crawl</li>
                    <li>The crawler will visit pages up to the specified limit</li>
                    <li>Results are displayed with links to the original pages</li>
                  </ol>
                  
                  <div className="bg-blue-50 p-4 rounded-md mt-4">
                    <h4 className="font-medium text-blue-700 mb-2">API Key Required</h4>
                    <p className="text-sm text-blue-600">
                      You'll need an API key from Firecrawl to use this feature. Visit <a href="https://firecrawl.dev" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">firecrawl.dev</a> to sign up and get your API key.
                    </p>
                  </div>
                  
                  <h3 className="text-lg font-medium mt-6 mb-2">Use Cases</h3>
                  <ul className="list-disc ml-5 space-y-2">
                    <li>Research investment opportunities on company websites</li>
                    <li>Gather data on market trends from industry publications</li>
                    <li>Analyze real estate listings from multiple sources</li>
                    <li>Find contact information for potential investment partners</li>
                    <li>Compare investment terms across different platforms</li>
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          <div className="p-4 bg-gray-100 rounded-md text-sm text-gray-600">
            <h2 className="text-base font-semibold mb-2">About Firecrawl</h2>
            <p>
              Firecrawl is a powerful web scraping and crawling service that enables you to extract data from any website.
              You'll need an API key from Firecrawl to use this feature. Visit <a href="https://firecrawl.dev" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">firecrawl.dev</a> to learn more.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebCrawler;
