import FirecrawlApp from "@mendable/firecrawl-js";

// Updated interface definitions to match actual response structure
interface ErrorResponse {
  success: false;
  message?: string; // Using message instead of error
}

interface CrawlStatusResponse {
  success: true;
  status?: string;
  completed?: number;
  total?: number;
  creditsUsed?: number;
  expiresAt?: string;
  data?: any[];
  requestId?: string; // Added requestId field to match the actual response
}

type CrawlResponse = CrawlStatusResponse | ErrorResponse;

// AI Analysis interfaces
interface AIAnalysisRequest {
  propertyData: any;
  propertyAddress: string;
  propertyCity: string;
}

interface AIAnalysisResponse {
  insights: PropertyInsight[];
  summary: string;
  investmentRecommendation: string;
  riskAssessment: string;
  marketTrends: string;
}

interface PropertyInsight {
  title: string;
  content: string;
  type: 'positive' | 'negative' | 'neutral';
}

export class FirecrawlService {
  private static API_KEY_STORAGE_KEY = 'firecrawl_api_key';
  private static OPENAI_API_KEY_STORAGE_KEY = 'openai_api_key';
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

  static saveOpenAIApiKey(apiKey: string): void {
    localStorage.setItem(this.OPENAI_API_KEY_STORAGE_KEY, apiKey);
    console.log('OpenAI API key saved successfully');
  }

  static getOpenAIApiKey(): string | null {
    return localStorage.getItem(this.OPENAI_API_KEY_STORAGE_KEY);
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

  static async testOpenAIApiKey(apiKey: string): Promise<boolean> {
    try {
      console.log('Testing OpenAI API key');
      const response = await fetch('https://api.openai.com/v1/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          prompt: "Say hello",
          max_tokens: 5
        })
      });
      
      const data = await response.json();
      return !data.error && data.choices && data.choices.length > 0;
    } catch (error) {
      console.error('Error testing OpenAI API key:', error);
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
      // Updated to use Cherre.com as a data source
      const url = `https://www.cherre.com/real-estate-data`;
      
      console.log('Fetching property data from:', url);
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
      const crawlData = crawlResponse.data || [];
      
      // Enhanced market insights extraction from Cherre data
      const marketInsights = crawlData.map((item: any) => {
        return {
          title: item.title || 'Market Data',
          content: item.content || item.markdown || 'No content available',
          url: item.url
        };
      });

      // Use a fallback ID if requestId is not available
      const crawlId = crawlResponse.requestId ?? `crawl-${Date.now()}`;

      // Generate AI insights if OpenAI API key is available
      let aiAnalysis = null;
      const openAIApiKey = this.getOpenAIApiKey();
      if (openAIApiKey) {
        try {
          aiAnalysis = await this.generateAIInsights({
            propertyData: marketInsights,
            propertyAddress,
            propertyCity
          }, openAIApiKey);
        } catch (aiError) {
          console.error('Error generating AI insights:', aiError);
          // Continue without AI insights
        }
      }

      return { 
        success: true,
        data: {
          crawlId: crawlId,
          data: marketInsights,
          aiAnalysis
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

  static async generateAIInsights(data: AIAnalysisRequest, apiKey: string): Promise<AIAnalysisResponse> {
    try {
      console.log('Generating AI insights for property data');
      
      // Prepare the content for the AI prompt
      const propertyContent = data.propertyData
        .map((item: any) => item.content?.substring(0, 500) || '')
        .join('\n\n')
        .substring(0, 3000); // Limit to 3000 chars to keep token count manageable
      
      const prompt = `
        You are a real estate investment analyst providing insights about a property.
        
        Property Address: ${data.propertyAddress}
        Property City: ${data.propertyCity}
        
        Market Data:
        ${propertyContent}
        
        Based on this information, provide:
        1. A concise summary of the property market (2-3 sentences)
        2. 3-5 key investment insights, each with a title and brief explanation
        3. An investment recommendation (Strong Buy, Buy, Hold, or Avoid)
        4. A brief risk assessment
        5. Market trends that could affect this property
        
        Format your response in JSON with the following structure:
        {
          "summary": "Your market summary here",
          "insights": [
            {"title": "Insight title", "content": "Insight content", "type": "positive|negative|neutral"}
          ],
          "investmentRecommendation": "Your recommendation",
          "riskAssessment": "Your risk assessment",
          "marketTrends": "Your market trends analysis"
        }
      `;
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 1000
        })
      });
      
      const responseData = await response.json();
      
      if (responseData.error) {
        throw new Error(responseData.error.message || 'Error generating AI insights');
      }
      
      const content = responseData.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No content returned from AI');
      }
      
      try {
        // Parse JSON response from the AI
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Could not extract JSON from AI response');
        }
        
        const jsonResponse = JSON.parse(jsonMatch[0]);
        return {
          summary: jsonResponse.summary || 'No summary available',
          insights: jsonResponse.insights || [],
          investmentRecommendation: jsonResponse.investmentRecommendation || 'No recommendation available',
          riskAssessment: jsonResponse.riskAssessment || 'No risk assessment available',
          marketTrends: jsonResponse.marketTrends || 'No market trends available'
        };
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError, content);
        // Fallback to a simplified response
        return {
          summary: 'Unable to generate detailed analysis at this time.',
          insights: [{ 
            title: 'Market Analysis', 
            content: 'Please try again later for AI-generated insights.', 
            type: 'neutral' 
          }],
          investmentRecommendation: 'Analysis pending',
          riskAssessment: 'Analysis pending',
          marketTrends: 'Analysis pending'
        };
      }
    } catch (error) {
      console.error('Error in AI analysis:', error);
      throw error;
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
      
      // Use a fallback ID if requestId is not available
      const crawlId = crawlResponse.requestId ?? `crawl-${Date.now()}`;
      
      return {
        crawlId: crawlId,
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
