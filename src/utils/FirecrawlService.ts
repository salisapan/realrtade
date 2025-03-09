
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
        console.error('Property data crawl failed:', crawlResponse.error);
        return { 
          success: false, 
          error: crawlResponse.error || 'Failed to crawl property data' 
        };
      }

      // Analyze the crawled data for market insights
      const response = await this.firecrawlApp.analyzeUrl(url, {
        query: `Provide market insights about real estate in ${propertyCity}, specifically around ${propertyAddress}. Include trends in property values, investment opportunities, and market forecasts.`,
        limit: 5
      });

      return { 
        success: true,
        data: {
          crawlId: crawlResponse.id,
          data: response.data
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
        throw new Error(crawlResponse.error || "Crawl failed");
      }

      // If we have a search query, use it to analyze the content
      let results;
      if (searchQuery) {
        // Analyze results with the search query
        results = await this.client.analyzeUrl(url, {
          query: searchQuery,
          limit: maxPages
        });
      } else {
        // Just return the crawl results
        results = crawlResponse;
      }
      
      return {
        crawlId: crawlResponse.id,
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
