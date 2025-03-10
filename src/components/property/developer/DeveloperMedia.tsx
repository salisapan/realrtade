
interface DeveloperMediaProps {
  mediaArticles: {
    title: string;
    source: string;
    date: string;
    url: string;
  }[];
}

export const DeveloperMedia = ({ mediaArticles }: DeveloperMediaProps) => {
  return (
    <div>
      <h3 className="text-lg font-medium mb-4">Media Coverage</h3>
      <div className="space-y-4">
        {mediaArticles.map((article, index) => (
          <div key={index} className="border rounded-lg p-4">
            <h4 className="font-medium text-blue-600 hover:underline">
              <a href={article.url} target="_blank" rel="noopener noreferrer">
                {article.title}
              </a>
            </h4>
            <div className="flex items-center text-sm text-gray-500 mt-1">
              <span className="font-medium">{article.source}</span>
              <span className="mx-2">•</span>
              <span>{article.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
