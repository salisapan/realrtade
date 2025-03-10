
import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Users, TrendingUp, Search, Plus, ChevronUp, ChevronDown, Star, Award, MessageSquare } from "lucide-react";

// Demo data for the forum
const forumCategories = [
  { id: "investment-strategies", name: "Investment Strategies", icon: <TrendingUp className="w-4 h-4" /> },
  { id: "market-trends", name: "Market Trends", icon: <TrendingUp className="w-4 h-4" /> },
  { id: "developer-qa", name: "Developer Q&A", icon: <MessageCircle className="w-4 h-4" /> },
  { id: "property-discussions", name: "Property Discussions", icon: <Users className="w-4 h-4" /> }
];

const forumThreads = [
  {
    id: 1,
    title: "Best strategies for apartment investing in 2023?",
    author: "investor123",
    authorBadge: "Top Contributor",
    category: "investment-strategies",
    lastActive: "2 hours ago",
    replies: 23,
    views: 142,
    upvotes: 18,
    preview: "I'm considering investing in apartment buildings in the midwest. What strategies are working best in the current market? I've heard cap rates are..."
  },
  {
    id: 2,
    title: "Commercial real estate outlook post-pandemic",
    author: "market_analyst",
    authorBadge: "Market Expert",
    category: "market-trends",
    lastActive: "1 day ago",
    replies: 42,
    views: 312,
    upvotes: 31,
    preview: "Let's discuss how commercial real estate is evolving after the pandemic. Office spaces are seeing interesting transformations with hybrid work models..."
  },
  {
    id: 3,
    title: "Q&A with Pinnacle Real Estate Group CEO",
    author: "pinnacle_ceo",
    authorBadge: "Verified Developer",
    category: "developer-qa",
    lastActive: "3 days ago",
    replies: 54,
    views: 423,
    upvotes: 87,
    preview: "I'm John Smith, CEO of Pinnacle Real Estate Group. I'll be answering questions about our latest developments and investment opportunities..."
  },
  {
    id: 4,
    title: "The International Gem Tower - Worth the investment?",
    author: "curious_investor",
    category: "property-discussions",
    lastActive: "5 hours ago",
    replies: 19,
    views: 98,
    upvotes: 12,
    preview: "Has anyone invested in The International Gem Tower? I'm looking at putting in around $25,000 and would love to hear experiences from current investors..."
  },
  {
    id: 5,
    title: "Tax strategies for real estate investors in 2023",
    author: "tax_pro",
    authorBadge: "Tax Expert",
    category: "investment-strategies",
    lastActive: "2 days ago",
    replies: 31,
    views: 256,
    upvotes: 42,
    preview: "Let's discuss effective tax strategies for real estate investors this year. With recent changes to tax laws, there are several optimization opportunities..."
  }
];

const CommunityForum = () => {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  
  const filteredThreads = forumThreads
    .filter(thread => 
      (activeCategory === "all" || thread.category === activeCategory) &&
      (searchQuery === "" || 
        thread.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        thread.preview.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      if (sortBy === "recent") {
        // This is a simple sort for demo purposes
        return b.id - a.id;
      } else if (sortBy === "popular") {
        return b.views - a.views;
      } else if (sortBy === "most-replied") {
        return b.replies - a.replies;
      } else {
        return b.upvotes - a.upvotes;
      }
    });
  
  return (
    <div className="flex flex-col md:flex-row h-screen">
      <AppSidebar />
      
      <main className="flex-1 bg-gray-50 overflow-auto">
        <div className="container mx-auto py-6 px-4 max-w-6xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">Community Forum</h1>
            <p className="text-gray-600">
              Connect with other investors and developers to discuss opportunities, strategies, and market trends.
            </p>
          </div>
          
          <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <div className="flex flex-col sm:flex-row gap-3 justify-between">
                <div className="flex-1 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input 
                      placeholder="Search discussions..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button className="flex-shrink-0">
                    <Plus className="h-4 w-4 mr-2" />
                    New Post
                  </Button>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Sort by:</span>
                  <select 
                    className="bg-white border rounded px-2 py-1"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="recent">Most Recent</option>
                    <option value="popular">Most Viewed</option>
                    <option value="most-replied">Most Replies</option>
                    <option value="top-rated">Top Rated</option>
                  </select>
                </div>
              </div>
            </div>
            
            <Tabs defaultValue="all" value={activeCategory} onValueChange={setActiveCategory}>
              <div className="p-2 border-b bg-gray-50 overflow-x-auto">
                <TabsList className="h-auto">
                  <TabsTrigger value="all" className="data-[state=active]:bg-white">
                    All Topics
                  </TabsTrigger>
                  
                  {forumCategories.map(category => (
                    <TabsTrigger 
                      key={category.id} 
                      value={category.id}
                      className="data-[state=active]:bg-white flex items-center gap-1"
                    >
                      {category.icon}
                      {category.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              
              <TabsContent value="all" className="mt-0">
                <ForumThreadList threads={filteredThreads} />
              </TabsContent>
              
              {forumCategories.map(category => (
                <TabsContent key={category.id} value={category.id} className="mt-0">
                  <ForumThreadList threads={filteredThreads} />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
};

const ForumThreadList = ({ threads }: { threads: any[] }) => {
  return (
    <div className="divide-y">
      {threads.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>No discussions found matching your criteria.</p>
          <Button variant="outline" className="mt-4">
            Start a new discussion
          </Button>
        </div>
      ) : (
        threads.map(thread => (
          <div key={thread.id} className="p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center text-center px-2 hidden sm:flex">
                <Button variant="ghost" size="sm" className="rounded-full w-8 h-8 p-0">
                  <ChevronUp className="h-5 w-5" />
                </Button>
                <span className="font-medium text-gray-700">{thread.upvotes}</span>
                <Button variant="ghost" size="sm" className="rounded-full w-8 h-8 p-0">
                  <ChevronDown className="h-5 w-5" />
                </Button>
              </div>
              
              <div className="flex-1">
                <h3 className="font-medium text-lg mb-1 hover:text-blue-600">
                  <a href="#">{thread.title}</a>
                </h3>
                
                <p className="text-gray-600 text-sm mb-2 line-clamp-2">{thread.preview}</p>
                
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    <span>{thread.author}</span>
                    {thread.authorBadge && (
                      <span className="inline-flex items-center bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 text-2xs ml-1">
                        {thread.authorBadge === "Top Contributor" && <Star className="h-3 w-3 mr-0.5" />}
                        {thread.authorBadge === "Market Expert" && <Award className="h-3 w-3 mr-0.5" />}
                        {thread.authorBadge === "Verified Developer" && <Award className="h-3 w-3 mr-0.5 text-green-600" />}
                        {thread.authorBadge === "Tax Expert" && <Award className="h-3 w-3 mr-0.5 text-purple-600" />}
                        {thread.authorBadge}
                      </span>
                    )}
                  </div>
                  <div>Last active: {thread.lastActive}</div>
                  <div className="flex items-center gap-1">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {thread.replies} replies
                  </div>
                  <div className="flex items-center gap-1">
                    <span>{thread.views} views</span>
                  </div>
                  <div className="sm:hidden flex items-center gap-1">
                    <ChevronUp className="h-3.5 w-3.5" />
                    <span>{thread.upvotes}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default CommunityForum;
