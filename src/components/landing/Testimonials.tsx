
import { Star } from "lucide-react";

const testimonials = [
  {
    id: 1,
    name: "Sarah K.",
    location: "New York, NY",
    image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=250&h=250&fit=crop&crop=faces",
    testimonial: "Great returns in just 3 months! The platform is incredibly user-friendly and the analytics helped me make informed decisions.",
    rating: 5
  },
  {
    id: 2,
    name: "Michael P.",
    location: "Austin, TX",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=250&h=250&fit=crop&crop=faces",
    testimonial: "REALTRADE has opened up real estate investing to people like me who don't have hundreds of thousands to get started. I'm now building a diversified portfolio with just $100 a month.",
    rating: 5
  },
  {
    id: 3,
    name: "Jennifer W.",
    location: "Chicago, IL",
    image: "https://images.unsplash.com/photo-1619946794135-5bc917a27793?w=250&h=250&fit=crop&crop=faces",
    testimonial: "The due diligence on each property gives me peace of mind. I've invested in three properties so far and each one is performing exactly as projected.",
    rating: 4
  }
];

export const Testimonials = () => {
  return (
    <div className="bg-white py-16">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">What Our Investors Say</h2>
          <p className="text-xl text-gray-600">
            Join thousands of satisfied investors building wealth through real estate
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial) => (
            <div key={testimonial.id} className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
              <div className="flex mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star 
                    key={i} 
                    className={`w-5 h-5 ${i < testimonial.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} 
                  />
                ))}
              </div>
              
              <p className="text-gray-600 italic mb-4">"{testimonial.testimonial}"</p>
              
              <div className="flex items-center">
                <img 
                  src={testimonial.image} 
                  alt={testimonial.name} 
                  className="w-12 h-12 rounded-full mr-4 object-cover" 
                />
                <div>
                  <h4 className="font-semibold">{testimonial.name}</h4>
                  <p className="text-sm text-gray-500">{testimonial.location}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
