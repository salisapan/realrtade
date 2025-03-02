
import { Link } from "react-router-dom";
import { UserCircle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryFilter } from "@/components/CategoryFilter";

interface Category {
  id: string;
  name: string;
  active: boolean;
}

interface PropertiesHeaderProps {
  categories: Category[];
  onSelectCategory: (categoryId: string) => void;
}

export const PropertiesHeader = ({ categories, onSelectCategory }: PropertiesHeaderProps) => {
  return (
    <header className="bg-white shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <img 
              src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
              alt="RealTrade Logo" 
              className="h-10 mr-4 rounded-lg" 
            />
            <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-primary">See All ►</button>
            <Link to="/">
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <Home className="w-4 h-4" />
                Home
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost" size="icon">
                <UserCircle className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>
        <CategoryFilter
          categories={categories}
          onSelect={onSelectCategory}
        />
      </div>
    </header>
  );
};
