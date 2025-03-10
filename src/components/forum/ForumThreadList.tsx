
import { Button } from "@/components/ui/button";
import { MessageCircle, Users, ChevronUp, ChevronDown, Star, Award, MessageSquare } from "lucide-react";

// Define the thread type
export interface ForumThread {
  id: number;
  title: string;
  author: string;
  authorBadge?: string;
  category: string;
  lastActive: string;
  replies: number;
  views: number;
  upvotes: number;
  preview: string;
}

interface ForumThreadListProps {
  threads: ForumThread[];
}

export const ForumThreadList = ({ threads }: ForumThreadListProps) => {
  return (
    <div className="divide-y">
      {threads.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>No discussions found matching your criteria.</p>
          <Button variant="outline" className="mt-4">
            Start a new discussion
          </Button>
        </div>
      ) : (
        threads.map(thread => (
          <div key={thread.id} className="p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center text-center px-2 hidden sm:flex">
                <Button variant="ghost" size="sm" className="rounded-full w-8 h-8 p-0">
                  <ChevronUp className="h-5 w-5" />
                </Button>
                <span className="font-medium text-gray-700">{thread.upvotes}</span>
                <Button variant="ghost" size="sm" className="rounded-full w-8 h-8 p-0">
                  <ChevronDown className="h-5 w-5" />
                </Button>
              </div>
              
              <div className="flex-1">
                <h3 className="font-medium text-lg mb-1 hover:text-blue-600">
                  <a href="#">{thread.title}</a>
                </h3>
                
                <p className="text-gray-600 text-sm mb-2 line-clamp-2">{thread.preview}</p>
                
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    <span>{thread.author}</span>
                    {thread.authorBadge && (
                      <span className="inline-flex items-center bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 text-2xs ml-1">
                        {thread.authorBadge === "Top Contributor" && <Star className="h-3 w-3 mr-0.5" />}
                        {thread.authorBadge === "Market Expert" && <Award className="h-3 w-3 mr-0.5" />}
                        {thread.authorBadge === "Verified Developer" && <Award className="h-3 w-3 mr-0.5 text-green-600" />}
                        {thread.authorBadge === "Tax Expert" && <Award className="h-3 w-3 mr-0.5 text-purple-600" />}
                        {thread.authorBadge}
                      </span>
                    )}
                  </div>
                  <div>Last active: {thread.lastActive}</div>
                  <div className="flex items-center gap-1">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {thread.replies} replies
                  </div>
                  <div className="flex items-center gap-1">
                    <span>{thread.views} views</span>
                  </div>
                  <div className="sm:hidden flex items-center gap-1">
                    <ChevronUp className="h-3.5 w-3.5" />
                    <span>{thread.upvotes}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
