
import { Link } from "react-router-dom";
import { UserCircle, Home, Search, Filter, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryFilter } from "@/components/CategoryFilter";
import { Input } from "@/components/ui/input";

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
    <header className="bg-white border-b border-border sticky top-0 z-10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <Link to="/">
              <img 
                src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                alt="REALTRADE Logo" 
                className="h-10 mr-3 rounded-lg" 
              />
            </Link>
            <h1 className="text-xl md:text-2xl font-heading font-medium text-primary-dark">Properties</h1>
          </div>
          <div className="hidden md:flex items-center gap-3 flex-1 max-w-md mx-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input 
                type="search" 
                placeholder="Search properties..." 
                className="pl-10 bg-muted border-none h-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <Button variant="outline" size="sm" className="gap-1.5 h-9 hidden md:flex">
              <Filter className="w-4 h-4" />
              Filter
            </Button>
            <Link to="/">
              <Button variant="ghost" size="sm" className="flex items-center gap-1.5 h-9">
                <Home className="w-4 h-4" />
                <span className="hidden md:inline">Home</span>
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <UserCircle className="w-5 h-5" />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" className="h-9 w-9 relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-secondary rounded-full"></span>
            </Button>
          </div>
        </div>
        
        <div className="md:hidden relative flex items-center mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input 
            type="search" 
            placeholder="Search properties..." 
            className="pl-10 bg-muted border-none h-9 w-full"
          />
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <CategoryFilter
            categories={categories}
            onSelect={onSelectCategory}
          />
          
          <div className="flex items-center text-sm">
            <span className="mr-2 text-muted-foreground">Sort by:</span>
            <select className="bg-transparent border-none text-primary font-medium focus:outline-none cursor-pointer">
              <option>Newest</option>
              <option>Highest Return</option>
              <option>Lowest Risk</option>
              <option>Ending Soon</option>
            </select>
          </div>
        </div>
      </div>
      
      <div className="px-4 py-2 bg-muted/50 border-t border-b border-border">
        <div className="container mx-auto">
          <p className="text-center text-sm text-muted-foreground font-medium">
            Invest in Real Estate Worldwide from Anywhere
          </p>
        </div>
      </div>
    </header>
  );
};
