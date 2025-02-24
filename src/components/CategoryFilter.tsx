
import { Button } from "@/components/ui/button";

interface Category {
  id: string;
  name: string;
  active?: boolean;
}

interface CategoryFilterProps {
  categories: Category[];
  onSelect: (id: string) => void;
}

export const CategoryFilter = ({ categories, onSelect }: CategoryFilterProps) => {
  return (
    <div className="flex gap-2 overflow-x-auto pb-4 md:pb-0 no-scrollbar">
      {categories.map((category) => (
        <Button
          key={category.id}
          onClick={() => onSelect(category.id)}
          variant={category.active ? "default" : "outline"}
          className="whitespace-nowrap rounded-full transition-all duration-300"
        >
          {category.name}
        </Button>
      ))}
    </div>
  );
};
