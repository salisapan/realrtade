
import { FirecrawlClient } from "@mendable/firecrawl-js";

export class FirecrawlService {
  private apiKey: string;
  private client: FirecrawlClient;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new FirecrawlClient(apiKey);
  }

  async crawlWebsite(url: string, searchQuery: string = "", maxPages: number = 10) {
    try {
      // Step 1: Create a crawl
      const crawl = await this.client.createCrawl({
        name: `Crawl of ${url}`,
        url: url,
        maxPages: maxPages,
      });

      console.log("Crawl created:", crawl);

      // Step 2: Start the crawl
      await this.client.startCrawl(crawl.id);
      console.log("Crawl started");

      // Step 3: Wait for crawl to complete
      let crawlStatus = await this.client.getCrawl(crawl.id);
      while (crawlStatus.status !== "completed" && crawlStatus.status !== "failed") {
        console.log("Waiting for crawl to complete...", crawlStatus.status);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
        crawlStatus = await this.client.getCrawl(crawl.id);
      }

      if (crawlStatus.status === "failed") {
        throw new Error("Crawl failed");
      }

      console.log("Crawl completed");

      // Step 4: Scrape the crawled content
      const scrapeOptions = {
        maxResults: 100,
        minScore: 0.5,
      };

      // If we have a search query, use it to analyze the content
      let results;
      if (searchQuery) {
        // Analyze results with the search query
        results = await this.client.analyzeCrawl(crawl.id, searchQuery);
      } else {
        // Just get all pages from the crawl
        results = await this.client.scrape(crawl.id, scrapeOptions);
      }
      
      return {
        crawlId: crawl.id,
        results: results,
        status: crawlStatus
      };
    } catch (error) {
      console.error("Error in crawlWebsite:", error);
      throw error;
    }
  }
}
