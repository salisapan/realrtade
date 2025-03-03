
import { Check, Clock, FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DueDiligenceItem {
  id: string;
  name: string;
  status: "completed" | "in-progress" | "not-started";
  completedDate?: string;
}

interface DueDiligenceListProps {
  dealTitle: string;
  items: DueDiligenceItem[];
  onUpload: (itemId: string) => void;
  onSchedule: (itemId: string) => void;
}

export const DueDiligenceList = ({ 
  dealTitle, 
  items, 
  onUpload, 
  onSchedule 
}: DueDiligenceListProps) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <Check className="text-green-500 w-5 h-5" />;
      case "in-progress":
        return <Clock className="text-yellow-500 w-5 h-5" />;
      case "not-started":
        return <X className="text-gray-300 w-5 h-5" />;
      default:
        return <FileText className="text-gray-400 w-5 h-5" />;
    }
  };

  const getCompletionText = (item: DueDiligenceItem) => {
    if (item.status === "completed" && item.completedDate) {
      return `Completed on ${item.completedDate}`;
    }
    return "";
  };

  const getActionButton = (item: DueDiligenceItem) => {
    switch (item.status) {
      case "in-progress":
        return (
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => onUpload(item.id)}
            className="flex items-center gap-1"
          >
            <Upload className="w-4 h-4" />
            Upload Results
          </Button>
        );
      case "not-started":
        return (
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => onSchedule(item.id)}
            className="flex items-center gap-1"
          >
            <Clock className="w-4 h-4" />
            Schedule
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium">{dealTitle} - Due Diligence Checklist</h3>
        <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">In Progress</span>
      </div>
      
      <div className="space-y-2 border rounded-md p-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
            <div className="flex items-center gap-3">
              {getStatusIcon(item.status)}
              <span>{item.name}</span>
            </div>
            
            <div className="flex items-center">
              {item.status === "completed" ? (
                <span className="text-sm text-gray-500">{getCompletionText(item)}</span>
              ) : (
                getActionButton(item)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
