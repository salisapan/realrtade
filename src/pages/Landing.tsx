import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Building2, LineChart, Users, DollarSign, ArrowRight, Star, Shield, Clock } from "lucide-react";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Testimonials } from "@/components/landing/Testimonials";
import { HomeFooter } from "@/components/landing/HomeFooter";
import { HowPropertyOwnershipWorks } from "@/components/HowPropertyOwnershipWorks";

const Landing = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <div className="container mx-auto px-4 pt-12 md:pt-20 pb-10 md:pb-16">
        <div className="max-w-3xl mx-auto text-center">
          {/* Added Logo Above Title */}
          <div className="mb-6 flex justify-center">
            <img 
              src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
              alt="RealTrade Logo" 
              className="h-16 md:h-20 object-contain rounded-lg animate-float"
            />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 md:mb-6 relative z-10 overflow-hidden">
            <span className="bg-gradient-to-r from-primary via-primary-light to-primary bg-clip-text text-transparent animate-pulse-slow">
              RealTrade
            </span> - 
            <span className="relative">
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Invest in real estate</span>
              <span className="bg-gradient-to-br from-blue-500 to-primary bg-clip-text text-transparent"> worldwide from anywhere.</span>
              <span className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-purple-500 transform animate-grow"></span>
            </span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-6 md:mb-8 px-2 animate-fade-in">Make informed investment with comprehensive market data and analysis on deal from the top US real estate entrepreneurs.</p>
          <Link to="/investor-signup">
            <Button size="lg" className="text-base md:text-lg px-5 md:px-8 py-2 md:py-2.5 h-auto min-h-[44px] relative overflow-hidden group button-hover-effect hover-glow">
              Get Started 
              <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </div>

      {/* How It Works Section */}
      <HowItWorks />

      {/* Value Proposition Section */}
      <div className="container mx-auto px-4 py-10 md:py-16">
        <div className="max-w-3xl mx-auto text-center mb-8 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 md:mb-4">Why Choose RealTrade?</h2>
          <p className="text-base md:text-xl text-gray-600 px-2">
            We connect you with high-quality real estate investment opportunities, giving you the transparency and control you deserve.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <div className="bg-white p-5 md:p-6 rounded-lg shadow-sm border border-gray-100 text-center">
            <div className="bg-primary/10 w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
              <Shield className="w-6 h-6 md:w-8 md:h-8 text-primary" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold mb-2">Verified Investments</h3>
            <p className="text-sm md:text-base text-gray-600">
              All deals undergo rigorous due diligence by our team of experts before being listed on our platform.
            </p>
          </div>
          
          <div className="bg-white p-5 md:p-6 rounded-lg shadow-sm border border-gray-100 text-center">
            <div className="bg-primary/10 w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
              <DollarSign className="w-6 h-6 md:w-8 md:h-8 text-primary" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold mb-2">Low Minimums</h3>
            <p className="text-sm md:text-base text-gray-600">
              Start with as little as $10 and build your real estate portfolio one investment at a time.
            </p>
          </div>
          
          <div className="bg-white p-5 md:p-6 rounded-lg shadow-sm border border-gray-100 text-center">
            <div className="bg-primary/10 w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
              <Clock className="w-6 h-6 md:w-8 md:h-8 text-primary" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold mb-2">Regular Returns</h3>
            <p className="text-sm md:text-base text-gray-600">
              Receive quarterly distributions and track the performance of your investments in real-time.
            </p>
          </div>
        </div>
      </div>

      {/* Statistics Section */}
      <div className="bg-primary/5 py-10 md:py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8 text-center">
            <div className="p-4">
              <div className="text-3xl md:text-4xl font-bold text-primary mb-1 md:mb-2">$1.5B+</div>
              <div className="text-sm md:text-base text-gray-600">Total Investment Volume</div>
            </div>
            <div className="p-4">
              <div className="text-3xl md:text-4xl font-bold text-primary mb-1 md:mb-2">15K+</div>
              <div className="text-sm md:text-base text-gray-600">Active Investors</div>
            </div>
            <div className="p-4">
              <div className="text-3xl md:text-4xl font-bold text-primary mb-1 md:mb-2">500+</div>
              <div className="text-sm md:text-base text-gray-600">Properties Funded</div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-10 md:py-16 text-center">
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4 md:mb-6">
          Ready to Start Investing Smarter?
        </h2>
        <p className="text-base md:text-xl text-gray-600 mb-6 md:mb-8 max-w-2xl mx-auto px-2">
          Join thousands of investors who are already using our platform to make data-driven investment decisions.
        </p>
        <Link to="/investor-signup">
          <Button size="lg" className="text-base md:text-lg px-5 md:px-8 py-2 md:py-2.5 h-auto min-h-[44px]">
            Get Started Now <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5" />
          </Button>
        </Link>
      </div>

      {/* How Property Ownership Works Section */}
      <HowPropertyOwnershipWorks />

      {/* Testimonials Section */}
      <Testimonials />

      {/* Footer */}
      <HomeFooter />
    </div>
  );
};

export default Landing;
