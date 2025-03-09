
// Mock implementation to avoid TypeScript errors
// This file is kept for backward compatibility but we're not using its functionality

interface ErrorResponse {
  success: false;
  error: string;
}

interface CrawlStatusResponse {
  success: true;
  status: string;
  completed: number;
  total: number;
  creditsUsed: number;
  expiresAt: string;
  data: any[];
  requestId: string; // Added the missing property
}

type CrawlResponse = CrawlStatusResponse | ErrorResponse;

export class FirecrawlService {
  private static API_KEY_STORAGE_KEY = 'firecrawl_api_key';
  
  static saveApiKey(apiKey: string): void {
    localStorage.setItem(this.API_KEY_STORAGE_KEY, apiKey);
    console.log('API key saved successfully');
  }

  static getApiKey(): string | null {
    return localStorage.getItem(this.API_KEY_STORAGE_KEY);
  }

  // This method only returns mock data now
  static async crawlWebsite(url: string): Promise<{ success: boolean; error?: string; data?: any }> {
    console.log('Mock crawl for URL:', url);
    return { 
      success: true,
      data: {
        status: "completed",
        completed: 10,
        total: 10,
        creditsUsed: 5,
        expiresAt: new Date().toISOString(),
        requestId: "mock-request-id",
        data: []
      }
    };
  }
}
