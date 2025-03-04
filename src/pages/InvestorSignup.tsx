
import React from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { 
  UserPlus, 
  ArrowRight, 
  DollarSign, 
  Building, 
  Shield, 
  ChevronLeft,
  Info
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const InvestorSignup = () => {
  const { toast } = useToast();
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Registration Successful",
      description: "Your investor account has been created. You'll be redirected to your dashboard.",
      variant: "success",
    });
    // In a real app, you would redirect or handle the form submission
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center text-primary mb-6 hover:underline">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Home
        </Link>
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Investor Registration</h1>
            <p className="text-gray-600 mt-2">Create your account to start investing in premium real estate opportunities</p>
          </div>
          <img 
            src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
            alt="RealTrade Logo" 
            className="h-12 md:h-16" 
          />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  Investor Information
                </CardTitle>
                <CardDescription>
                  Please provide your details to create your investor profile
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Country of Residence
                      </label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary">
                        <option value="">Select country</option>
                        <option value="us">United States</option>
                        <option value="uk">United Kingdom</option>
                        <option value="ca">Canada</option>
                        <option value="au">Australia</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Investment Experience
                      </label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary">
                        <option value="">Select experience level</option>
                        <option value="beginner">Beginner (0-2 years)</option>
                        <option value="intermediate">Intermediate (3-5 years)</option>
                        <option value="experienced">Experienced (5+ years)</option>
                        <option value="professional">Professional Investor</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Annual Income Range
                      </label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary">
                        <option value="">Select income range</option>
                        <option value="under50k">Under $50,000</option>
                        <option value="50k-100k">$50,000 - $100,000</option>
                        <option value="100k-250k">$100,000 - $250,000</option>
                        <option value="250k-1m">$250,000 - $1,000,000</option>
                        <option value="over1m">Over $1,000,000</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Estimated Net Worth
                      </label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary">
                        <option value="">Select net worth range</option>
                        <option value="under100k">Under $100,000</option>
                        <option value="100k-500k">$100,000 - $500,000</option>
                        <option value="500k-1m">$500,000 - $1,000,000</option>
                        <option value="1m-5m">$1,000,000 - $5,000,000</option>
                        <option value="over5m">Over $5,000,000</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <div className="flex items-start">
                        <div className="flex items-center h-5">
                          <input
                            id="accredited"
                            name="accredited"
                            type="checkbox"
                            className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                          />
                        </div>
                        <div className="ml-3 text-sm">
                          <label htmlFor="accredited" className="font-medium text-gray-700">
                            I am an accredited investor
                          </label>
                          <p className="text-gray-500">
                            Accredited investors have access to all investment opportunities on the platform.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <div className="flex items-start">
                        <div className="flex items-center h-5">
                          <input
                            id="terms"
                            name="terms"
                            type="checkbox"
                            required
                            className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                          />
                        </div>
                        <div className="ml-3 text-sm">
                          <label htmlFor="terms" className="font-medium text-gray-700">
                            I agree to the Terms of Service and Privacy Policy
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <Button type="submit" className="w-full md:w-auto">
                      Create Investor Account
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
          
          <div className="space-y-6">
            <Card className="bg-primary text-white">
              <CardHeader>
                <CardTitle className="text-white">Investor Benefits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <DollarSign className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium">Low Minimum Investment</h4>
                    <p className="text-sm text-white/80">Start with as little as $10 per property</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Building className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium">Premium Properties</h4>
                    <p className="text-sm text-white/80">Access exclusive real estate opportunities globally</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium">Verified Deals</h4>
                    <p className="text-sm text-white/80">All properties undergo rigorous due diligence</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-secondary" />
                  Accredited Investor Status
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="mb-3">
                  In the United States, an accredited investor is someone who:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-gray-700">
                  <li>Has an annual income exceeding $200,000 ($300,000 for joint income) for the last two years</li>
                  <li>Has a net worth exceeding $1 million, excluding primary residence</li>
                  <li>Holds certain professional certifications or credentials</li>
                </ul>
                <p className="mt-3 text-primary font-medium">
                  Accredited investors gain access to all investment opportunities on our platform.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvestorSignup;
