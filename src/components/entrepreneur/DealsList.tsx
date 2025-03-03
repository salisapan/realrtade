
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Pencil, Trash2, Eye } from "lucide-react";

interface Deal {
  id: string;
  title: string;
  location: string;
  price: string;
  fundingPercentage: number;
  imageUrl: string;
}

interface DealsListProps {
  deals: Deal[];
  onEdit: (dealId: string) => void;
  onDelete: (dealId: string) => void;
  onView: (dealId: string) => void;
}

export const DealsList = ({ deals, onEdit, onDelete, onView }: DealsListProps) => {
  return (
    <div className="space-y-4">
      {deals.length === 0 ? (
        <div className="text-center py-8 border rounded-md">
          <p className="text-gray-500">No deals found. Upload your first deal to get started!</p>
        </div>
      ) : (
        deals.map((deal) => (
          <div key={deal.id} className="border rounded-md p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img 
                  src={deal.imageUrl} 
                  alt={deal.title}
                  className="w-16 h-16 object-cover rounded" 
                />
                <div>
                  <h3 className="font-medium">{deal.title}</h3>
                  <p className="text-sm text-gray-500">{deal.location} | {deal.price}</p>
                  
                  <div className="mt-2 w-full max-w-xs">
                    <Progress value={deal.fundingPercentage} className="h-2" />
                    <p className="text-xs text-gray-500 mt-1">{deal.fundingPercentage}% Funded</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => onView(deal.id)}
                  className="flex items-center gap-1"
                >
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">View</span>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => onEdit(deal.id)}
                  className="flex items-center gap-1"
                >
                  <Pencil className="w-4 h-4" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => onDelete(deal.id)}
                  className="flex items-center gap-1 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
