
import FirecrawlApp from "@mendable/firecrawl-js";

export class FirecrawlService {
  private static API_KEY_STORAGE_KEY = 'firecrawl_api_key';
  private static firecrawlApp: FirecrawlApp | null = null;
  
  private apiKey: string;
  private client: FirecrawlApp;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new FirecrawlApp({ apiKey });
  }

  // Static methods for API key management
  static saveApiKey(apiKey: string): void {
    localStorage.setItem(this.API_KEY_STORAGE_KEY, apiKey);
    this.firecrawlApp = new FirecrawlApp({ apiKey });
    console.log('API key saved successfully');
  }

  static getApiKey(): string | null {
    return localStorage.getItem(this.API_KEY_STORAGE_KEY);
  }

  static async testApiKey(apiKey: string): Promise<boolean> {
    try {
      console.log('Testing API key with Firecrawl API');
      const tempClient = new FirecrawlApp({ apiKey });
      // A simple test crawl to verify the API key
      const testResponse = await tempClient.crawlUrl('https://example.com', {
        limit: 1
      });
      return testResponse.success;
    } catch (error) {
      console.error('Error testing API key:', error);
      return false;
    }
  }

  static async crawlPropertyData(propertyAddress: string, propertyCity: string): Promise<{ success: boolean; data?: any; error?: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, error: 'API key not found' };
    }

    try {
      if (!this.firecrawlApp) {
        this.firecrawlApp = new FirecrawlApp({ apiKey });
      }

      // Construct search query based on property details
      const searchQuery = `${propertyAddress} ${propertyCity} real estate market data`;
      
      // First crawl a real estate market data website
      const url = `https://www.zillow.com/homes/${propertyCity.replace(' ', '-')}_rb/`;
      
      console.log('Crawling property data from:', url);
      const crawlResponse = await this.firecrawlApp.crawlUrl(url, {
        limit: 10,
        scrapeOptions: {
          formats: ['markdown', 'html'],
        }
      });

      if (!crawlResponse.success) {
        console.error('Property data crawl failed:', crawlResponse);
        return { 
          success: false, 
          error: typeof crawlResponse === 'object' && 'message' in crawlResponse 
            ? String(crawlResponse.message) 
            : 'Failed to crawl property data' 
        };
      }

      // Process the crawled data for market insights
      // Note: We're using the crawled data directly instead of analyzeUrl 
      // since analyzeUrl isn't available in the current FirecrawlApp version
      const crawlData = crawlResponse.data || [];
      
      // Simple analysis of the data
      const marketInsights = crawlData.map((item: any) => {
        return {
          title: item.title || 'Market Data',
          content: item.content || item.markdown || 'No content available',
          url: item.url
        };
      });

      return { 
        success: true,
        data: {
          crawlId: crawlResponse.requestId || Date.now().toString(),
          data: marketInsights
        }
      };
    } catch (error) {
      console.error('Error during property data crawl:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to connect to Firecrawl API' 
      };
    }
  }

  async crawlWebsite(url: string, searchQuery: string = "", maxPages: number = 10) {
    try {
      console.log("Starting crawl for URL:", url);
      
      // Use crawlUrl for simpler implementation
      const crawlResponse = await this.client.crawlUrl(url, {
        limit: maxPages,
        scrapeOptions: {
          formats: ['markdown', 'html'],
        }
      });

      console.log("Crawl response:", crawlResponse);
      
      if (!crawlResponse.success) {
        // Safe access to error message
        const errorMessage = typeof crawlResponse === 'object' && 'message' in crawlResponse 
          ? String(crawlResponse.message) 
          : "Crawl failed";
        throw new Error(errorMessage);
      }

      // If we have a search query, we'll need to manually filter results
      // since analyzeUrl isn't available
      let results;
      if (searchQuery && searchQuery.trim() !== "") {
        // Perform basic filtering based on the search query
        const lowerCaseQuery = searchQuery.toLowerCase();
        results = {
          data: (crawlResponse.data || []).filter((item: any) => {
            const content = (item.content || item.markdown || "").toLowerCase();
            const title = (item.title || "").toLowerCase();
            return content.includes(lowerCaseQuery) || title.includes(lowerCaseQuery);
          }).map((item: any) => {
            return {
              ...item,
              score: 1, // Since we can't calculate a real relevance score
              excerpt: extractExcerpt(item.content || item.markdown || "", lowerCaseQuery)
            };
          })
        };
      } else {
        // Just return the crawl results
        results = {
          data: crawlResponse.data
        };
      }
      
      return {
        crawlId: crawlResponse.requestId || Date.now().toString(),
        results: searchQuery ? results.data : crawlResponse.data,
        status: {
          success: crawlResponse.success,
          completed: crawlResponse.completed,
          total: crawlResponse.total,
          creditsUsed: crawlResponse.creditsUsed
        }
      };
    } catch (error) {
      console.error("Error in crawlWebsite:", error);
      throw error;
    }
  }
}

// Helper function to extract a relevant excerpt containing the search term
function extractExcerpt(text: string, searchTerm: string, contextLength: number = 100): string {
  const lowerText = text.toLowerCase();
  const index = lowerText.indexOf(searchTerm);
  
  if (index === -1) return text.substring(0, 150) + "...";
  
  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + searchTerm.length + contextLength);
  
  return (start > 0 ? "..." : "") + 
         text.substring(start, end) + 
         (end < text.length ? "..." : "");
}
