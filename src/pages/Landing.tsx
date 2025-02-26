
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Building2, LineChart, Users, DollarSign, ArrowRight } from "lucide-react";

const Landing = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <div className="container mx-auto px-4 pt-20 pb-16">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Smart Real Estate Crowdfunding Analytics
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Make informed investment decisions with comprehensive market data and analysis from top US crowdfunding platforms.
          </p>
          <Link to="/properties">
            <Button size="lg" className="text-lg px-8">
              Explore Properties <ArrowRight className="ml-2" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <Building2 className="w-12 h-12 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Premium Properties</h3>
            <p className="text-gray-600">
              Access exclusive real estate opportunities from top US platforms.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <LineChart className="w-12 h-12 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Market Analysis</h3>
            <p className="text-gray-600">
              Deep insights into market trends and investment performance.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <Users className="w-12 h-12 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Community Insights</h3>
            <p className="text-gray-600">
              Learn from successful investors and share experiences.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <DollarSign className="w-12 h-12 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">ROI Tracking</h3>
            <p className="text-gray-600">
              Monitor your investments and track returns in real-time.
            </p>
          </div>
        </div>
      </div>

      {/* Statistics Section */}
      <div className="bg-primary/5 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-primary mb-2">$2.5B+</div>
              <div className="text-gray-600">Total Investment Volume</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary mb-2">15K+</div>
              <div className="text-gray-600">Active Investors</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary mb-2">500+</div>
              <div className="text-gray-600">Properties Funded</div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-6">
          Ready to Start Investing Smarter?
        </h2>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Join thousands of investors who are already using our platform to make data-driven investment decisions.
        </p>
        <Link to="/properties">
          <Button size="lg" className="text-lg px-8">
            Get Started Now <ArrowRight className="ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default Landing;
