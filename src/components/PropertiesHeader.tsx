
import { Link } from "react-router-dom";
import { UserCircle, Home, Search, Bell } from "lucide-react";
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
    <header className="bg-white shadow-sm sticky top-0 z-10">
      <div className="container mx-auto px-4 py-3 md:py-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4 sm:mb-6">
          <div className="flex items-center w-full sm:w-auto">
            <Link to="/" className="flex items-center">
              <img 
                src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                alt="RealTrade Logo" 
                className="h-8 md:h-10 mr-3 rounded-lg" 
              />
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 hidden sm:block">
                REALTRADE
              </h1>
            </Link>
            
            <div className="hidden md:block mx-auto max-w-xs">
              <p className="text-sm text-secondary italic ml-6">
                Invest in real estate worldwide from anywhere
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
            <div className="relative w-full sm:w-auto max-w-xs md:max-w-sm">
              <input 
                type="search" 
                placeholder="Search properties..." 
                className="pl-9 pr-4 py-2 w-full text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
            </div>
            
            <Link to="/">
              <Button variant="outline" size="sm" className="hidden sm:flex items-center gap-1">
                <Home className="w-4 h-4" />
                <span className="hidden md:inline">Home</span>
              </Button>
            </Link>
            
            <Link to="/dashboard">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full"></span>
              </Button>
            </Link>
            
            <Link to="/investor-signup" className="hidden sm:block">
              <Button variant="default" size="sm">
                Sign Up
              </Button>
            </Link>
            
            <Link to="/dashboard">
              <Button variant="ghost" size="icon">
                <UserCircle className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>
        
        <div className="overflow-x-auto pb-1 -mx-4 px-4">
          <CategoryFilter
            categories={categories}
            onSelect={onSelectCategory}
          />
        </div>
        
        <div className="flex justify-between items-center mt-3 mb-1">
          <div className="text-xs text-gray-500">
            Showing <span className="font-medium">24</span> properties
          </div>
          <button className="text-primary text-sm font-medium">
            See All Properties ►
          </button>
        </div>
      </div>
    </header>
  );
};
