import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Building2, LineChart, Users, DollarSign, ArrowRight, Star, Shield, Clock } from "lucide-react";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Testimonials } from "@/components/landing/Testimonials";
import { PartnerLogos } from "@/components/landing/PartnerLogos";
import { HomeFooter } from "@/components/landing/HomeFooter";
const Landing = () => {
  return <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <div className="container mx-auto px-4 pt-20 pb-16">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">RealTrade - Invest in real estate worldwide from anywhere.</h1>
          <p className="text-xl text-gray-600 mb-8">Make informed investment with comprehensive market data and analysis on deal from the top US real estate entrepreneurs.</p>
          <Link to="/investor-signup">
            <Button size="lg" className="text-lg px-8">
              Get Started <ArrowRight className="ml-2" />
            </Button>
          </Link>
        </div>
      </div>

      {/* How It Works Section */}
      <HowItWorks />

      {/* Partner Logos Section */}
      <PartnerLogos />

      {/* Value Proposition Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Choose RealTrade?</h2>
          <p className="text-xl text-gray-600">
            We connect you with high-quality real estate investment opportunities, giving you the transparency and control you deserve.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 text-center">
            <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Verified Investments</h3>
            <p className="text-gray-600">
              All deals undergo rigorous due diligence by our team of experts before being listed on our platform.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 text-center">
            <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Low Minimums</h3>
            <p className="text-gray-600">
              Start with as little as $10 and build your real estate portfolio one investment at a time.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 text-center">
            <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Regular Returns</h3>
            <p className="text-gray-600">
              Receive quarterly distributions and track the performance of your investments in real-time.
            </p>
          </div>
        </div>
      </div>

      {/* Statistics Section */}
      <div className="bg-primary/5 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-primary mb-2">$1.5B+</div>
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
        <Link to="/investor-signup">
          <Button size="lg" className="text-lg px-8">
            Get Started Now <ArrowRight className="ml-2" />
          </Button>
        </Link>
      </div>

      {/* Testimonials Section */}
      <Testimonials />

      {/* Footer */}
      <HomeFooter />
    </div>;
};
export default Landing;