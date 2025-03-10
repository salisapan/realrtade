
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, MessageCircle, Users } from "lucide-react";

// Define the forum categories data structure
export const forumCategories = [
  { id: "investment-strategies", name: "Investment Strategies", icon: <TrendingUp className="w-4 h-4" /> },
  { id: "market-trends", name: "Market Trends", icon: <TrendingUp className="w-4 h-4" /> },
  { id: "developer-qa", name: "Developer Q&A", icon: <MessageCircle className="w-4 h-4" /> },
  { id: "property-discussions", name: "Property Discussions", icon: <Users className="w-4 h-4" /> }
];

interface ForumCategoriesProps {
  activeCategory: string;
}

export const ForumCategories = ({ activeCategory }: ForumCategoriesProps) => {
  return (
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
  );
};
