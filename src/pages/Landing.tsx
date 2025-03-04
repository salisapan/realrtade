
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Building2, LineChart, Users, DollarSign, ArrowRight, Globe, ShieldCheck } from "lucide-react";

const Landing = () => {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header/Navigation */}
      <header className="bg-white border-b border-border py-4">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center">
            <img 
              src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
              alt="REALTRADE Logo" 
              className="h-10 md:h-12 mr-3" 
            />
            <span className="text-xl font-heading font-medium hidden md:inline">REALTRADE</span>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <Link to="/properties">
              <Button variant="outline" size="sm" className="text-xs md:text-sm">
                View Properties
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button size="sm" className="text-xs md:text-sm bg-primary hover:bg-primary-dark">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="luxury-gradient py-12 md:py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold font-heading text-white mb-4 md:mb-6">
            Invest in Real Estate as Easily as Stocks
          </h1>
          <p className="text-lg md:text-xl text-white/90 mb-8 max-w-3xl mx-auto">
            Make informed investment decisions with comprehensive market data and analysis from top US crowdfunding platforms.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/properties">
              <Button size="lg" className="w-full sm:w-auto text-primary bg-white hover:bg-gray-100">
                Explore Properties <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/entrepreneur/register">
              <Button size="lg" variant="outline" className="w-full sm:w-auto border-white text-white hover:bg-white/10">
                List Your Property
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="container mx-auto px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-heading text-center mb-12">Why Choose REALTRADE</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          <div className="card-luxury p-6 hover-lift">
            <Building2 className="w-12 h-12 text-secondary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Premium Properties</h3>
            <p className="text-foreground/80">
              Access exclusive real estate opportunities from top US platforms.
            </p>
          </div>
          <div className="card-luxury p-6 hover-lift">
            <LineChart className="w-12 h-12 text-secondary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Market Analysis</h3>
            <p className="text-foreground/80">
              Deep insights into market trends and investment performance.
            </p>
          </div>
          <div className="card-luxury p-6 hover-lift">
            <Users className="w-12 h-12 text-secondary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Community Insights</h3>
            <p className="text-foreground/80">
              Learn from successful investors and share experiences.
            </p>
          </div>
          <div className="card-luxury p-6 hover-lift">
            <DollarSign className="w-12 h-12 text-secondary mb-4" />
            <h3 className="text-xl font-semibold mb-2">ROI Tracking</h3>
            <p className="text-foreground/80">
              Monitor your investments and track returns in real-time.
            </p>
          </div>
        </div>
      </div>

      {/* Statistics Section */}
      <div className="bg-muted py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="p-6">
              <div className="text-4xl font-bold text-secondary mb-2 font-heading">$2.5B+</div>
              <div className="text-foreground">Total Investment Volume</div>
            </div>
            <div className="p-6">
              <div className="text-4xl font-bold text-secondary mb-2 font-heading">15K+</div>
              <div className="text-foreground">Active Investors</div>
            </div>
            <div className="p-6">
              <div className="text-4xl font-bold text-secondary mb-2 font-heading">500+</div>
              <div className="text-foreground">Properties Funded</div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="container mx-auto px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-heading text-center mb-12">How It Works</h2>
        <div className="flex flex-col md:flex-row gap-8 items-center">
          <div className="md:w-1/2">
            <img 
              src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab" 
              alt="Investment process" 
              className="rounded-lg shadow-lg w-full h-auto object-cover"
            />
          </div>
          <div className="md:w-1/2 space-y-6">
            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary text-white flex items-center justify-center font-bold">1</div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Browse Properties</h3>
                <p className="text-foreground/80">Explore our curated selection of high-quality real estate investments worldwide.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary text-white flex items-center justify-center font-bold">2</div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Select Your Investment</h3>
                <p className="text-foreground/80">Choose properties that match your investment goals with as little as $100 minimum investment.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary text-white flex items-center justify-center font-bold">3</div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Invest Securely</h3>
                <p className="text-foreground/80">Complete your investment through our secure platform with full transparency.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary text-white flex items-center justify-center font-bold">4</div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Track Performance</h3>
                <p className="text-foreground/80">Monitor your investment returns and property performance in real-time.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="luxury-gradient py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 font-heading">
            Let Your Money Work for You
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Join thousands of investors who are already using our platform to make data-driven investment decisions.
          </p>
          <Link to="/properties">
            <Button size="lg" className="bg-white text-primary hover:bg-gray-100 text-lg px-8">
              Get Started Now <ArrowRight className="ml-2" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Testimonials */}
      <div className="container mx-auto px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-heading text-center mb-12">What Our Investors Say</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="card-luxury p-6">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold mr-4">JD</div>
              <div>
                <h4 className="font-semibold">John Delaney</h4>
                <p className="text-sm text-foreground/70">Investor since 2021</p>
              </div>
            </div>
            <p className="italic text-foreground/80">"REALTRADE has transformed my investment portfolio. The detailed analytics and low minimum investments made it easy to diversify into real estate."</p>
          </div>
          <div className="card-luxury p-6">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold mr-4">SM</div>
              <div>
                <h4 className="font-semibold">Sarah Mitchell</h4>
                <p className="text-sm text-foreground/70">Investor since 2020</p>
              </div>
            </div>
            <p className="italic text-foreground/80">"As a first-time real estate investor, I appreciate the verified deals and comprehensive due diligence. It gives me confidence in every investment decision."</p>
          </div>
          <div className="card-luxury p-6">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold mr-4">RL</div>
              <div>
                <h4 className="font-semibold">Robert Lee</h4>
                <p className="text-sm text-foreground/70">Investor since 2022</p>
              </div>
            </div>
            <p className="italic text-foreground/80">"The ROI tracking and performance metrics on REALTRADE are exceptional. I can see exactly how my investments are performing in real-time."</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-primary text-white pt-12 pb-6">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center mb-4">
                <img 
                  src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                  alt="REALTRADE Logo" 
                  className="h-10 mr-3 bg-white p-1 rounded" 
                />
                <span className="text-xl font-heading font-medium">REALTRADE</span>
              </div>
              <p className="text-white/80 mb-4">Invest in Real Estate Worldwide from Anywhere</p>
              <div className="flex space-x-4">
                <a href="#" className="text-white/80 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
                  </svg>
                </a>
                <a href="#" className="text-white/80 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                  </svg>
                </a>
                <a href="#" className="text-white/80 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 3.997-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-3.997-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
                  </svg>
                </a>
                <a href="#" className="text-white/80 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c5.51 0 10-4.48 10-10S17.51 2 12 2zm6.605 4.61a8.502 8.502 0 011.93 5.314c-.281-.054-3.101-.629-5.943-.271-.065-.141-.12-.293-.184-.445a25.416 25.416 0 00-.564-1.236c3.145-1.28 4.577-3.124 4.761-3.362zM12 3.475c2.17 0 4.154.813 5.662 2.148-.152.216-1.443 1.941-4.48 3.08-1.399-2.57-2.95-4.675-3.189-5A8.687 8.687 0 0112 3.475zm-3.633.803a53.896 53.896 0 013.167 4.935c-3.992 1.063-7.517 1.04-7.896 1.04a8.581 8.581 0 014.729-5.975zM3.453 12.01v-.21c.37.01 4.512.065 8.775-1.215.25.477.477.965.694 1.453-.109.033-.228.065-.336.098-4.404 1.42-6.747 5.303-6.942 5.629a8.522 8.522 0 01-2.19-5.705zM12 20.547a8.482 8.482 0 01-5.239-1.8c.152-.315 1.888-3.656 6.703-5.337.022-.01.033-.01.054-.022a35.318 35.318 0 011.823 6.475 8.4 8.4 0 01-3.341.684zm4.761-1.465c-.086-.52-.542-3.015-1.659-6.084 2.679-.423 5.022.271 5.314.369a8.468 8.468 0 01-3.655 5.715z" clipRule="evenodd" />
                  </svg>
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
              <ul className="space-y-2">
                <li><Link to="/properties" className="text-white/80 hover:text-white">Browse Properties</Link></li>
                <li><Link to="/dashboard" className="text-white/80 hover:text-white">My Dashboard</Link></li>
                <li><Link to="/reports" className="text-white/80 hover:text-white">Investment Reports</Link></li>
                <li><Link to="/entrepreneur" className="text-white/80 hover:text-white">For Entrepreneurs</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Resources</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-white/80 hover:text-white">How It Works</a></li>
                <li><a href="#" className="text-white/80 hover:text-white">FAQ</a></li>
                <li><a href="#" className="text-white/80 hover:text-white">Investment Guide</a></li>
                <li><a href="#" className="text-white/80 hover:text-white">Market Research</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Contact Us</h3>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-secondary mt-1">📍</span>
                  <span className="text-white/80">123 Wall Street, New York, NY 10005</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-secondary mt-1">📱</span>
                  <span className="text-white/80">+1 (555) 123-4567</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-secondary mt-1">✉️</span>
                  <span className="text-white/80">info@realtrade.com</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/20 pt-6 flex flex-col md:flex-row justify-between items-center">
            <p className="text-white/60 text-sm">© 2023 REALTRADE. All rights reserved.</p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <a href="#" className="text-white/60 hover:text-white text-sm">Privacy Policy</a>
              <a href="#" className="text-white/60 hover:text-white text-sm">Terms of Service</a>
              <a href="#" className="text-white/60 hover:text-white text-sm">Cookie Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
