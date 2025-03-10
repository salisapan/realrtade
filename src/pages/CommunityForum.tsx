
import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ForumHeader } from "@/components/forum/ForumHeader";
import { ForumCategories, forumCategories } from "@/components/forum/ForumCategories";
import { ForumThreadList } from "@/components/forum/ForumThreadList";
import { forumThreads } from "@/data/forumData";

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
            <ForumHeader 
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              sortBy={sortBy}
              setSortBy={setSortBy}
            />
            
            <Tabs defaultValue="all" value={activeCategory} onValueChange={setActiveCategory}>
              <ForumCategories activeCategory={activeCategory} />
              
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

export default CommunityForum;
