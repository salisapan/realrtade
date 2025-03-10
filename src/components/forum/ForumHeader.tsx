
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";

interface ForumHeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortBy: string;
  setSortBy: (sort: string) => void;
}

export const ForumHeader = ({ 
  searchQuery, 
  setSearchQuery, 
  sortBy, 
  setSortBy 
}: ForumHeaderProps) => {
  return (
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
  );
};
