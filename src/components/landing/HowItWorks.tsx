
import { ArrowRight, UserPlus, Search, Wallet, TrendingUp } from "lucide-react";

export const HowItWorks = () => {
  return (
    <div className="bg-white py-16">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">How RealTrade Works</h2>
          <p className="text-xl text-gray-600">
            A simple 4-step process to start building your real estate portfolio
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
          <div className="text-center">
            <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 relative">
              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">1</div>
              <UserPlus className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Registration</h3>
            <p className="text-gray-600">
              Create your account and complete your investor profile
            </p>
          </div>
          
          <div className="text-center">
            <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 relative">
              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">2</div>
              <Search className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Browse Deals</h3>
            <p className="text-gray-600">
              Explore verified investment opportunities
            </p>
          </div>
          
          <div className="text-center">
            <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 relative">
              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">3</div>
              <Wallet className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Invest</h3>
            <p className="text-gray-600">
              Fund your chosen investments with as little as $10
            </p>
          </div>
          
          <div className="text-center">
            <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 relative">
              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">4</div>
              <TrendingUp className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Earn Returns</h3>
            <p className="text-gray-600">
              Receive distributions and watch your investment grow
            </p>
          </div>
        </div>
        
        <div className="flex justify-center mt-12">
          <ArrowRight className="text-primary w-16 h-16 animate-pulse" />
        </div>
      </div>
    </div>
  );
};
