
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bookmark, Share2 } from "lucide-react";

interface PropertyHeaderProps {
  property: {
    name: string;
  };
  bookmarked: boolean;
  onBookmark: () => void;
  onShare: () => void;
}

export const PropertyHeader = ({ 
  property, 
  bookmarked, 
  onBookmark, 
  onShare 
}: PropertyHeaderProps) => {
  return (
    <header className="bg-white shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 max-w-[75%]">
            <Link to="/" className="flex-shrink-0">
              <img 
                src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                alt="RealTrade Logo" 
                className="h-8 rounded-lg" 
              />
            </Link>
            <h1 className="text-lg md:text-xl font-bold text-gray-900 truncate ml-2">{property.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1 h-8 text-xs" 
              onClick={onBookmark}
            >
              <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? "fill-primary" : ""}`} />
              <span className="hidden sm:inline">{bookmarked ? "Saved" : "Save"}</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1 h-8 text-xs" 
              onClick={onShare}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
