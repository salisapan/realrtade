
import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white to-blue-50 animate-fade-in">
      <div className="text-center p-8 bg-white rounded-lg shadow-[0_4px_24px_rgba(66,133,244,0.15)] border-0 max-w-md w-full">
        <div className="mb-6 flex justify-center">
          <div className="h-24 w-24 bg-red-50 rounded-full flex items-center justify-center animate-pulse-slow">
            <span className="text-4xl font-bold text-red-500">404</span>
          </div>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2 text-gray-800">Page Not Found</h1>
        <p className="text-gray-600 mb-8">We couldn't find the page you were looking for.</p>
        <Link to="/">
          <Button className="bg-primary hover:bg-primary/90 text-white flex items-center gap-2 shadow-[0_0_10px_rgba(66,133,244,0.3)] transition-all duration-300 hover:shadow-[0_0_15px_rgba(66,133,244,0.5)]">
            <Home className="w-4 h-4" />
            Return to Home
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
