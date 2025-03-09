
import { AppSidebar } from "@/components/AppSidebar";
import { WebCrawlForm } from "@/components/firecrawl/WebCrawlForm";

const WebCrawler = () => {
  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Website Crawler</h1>
          <p className="mb-6 text-gray-600">
            Use this tool to crawl websites and extract data. Enter a URL to get started.
          </p>
          
          <WebCrawlForm />
          
          <div className="mt-8 p-4 bg-gray-100 rounded-md">
            <h2 className="text-lg font-semibold mb-2">About Firecrawl</h2>
            <p className="text-sm text-gray-600">
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
