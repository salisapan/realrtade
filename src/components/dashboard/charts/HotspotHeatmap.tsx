
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const HotspotHeatmap = () => {
  return (
    <Card className="bg-gray-800/50 backdrop-blur-md border border-gray-700 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
      <CardHeader>
        <CardTitle className="text-base md:text-lg text-white">Investment Hotspot Heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-[200px] w-full rounded-md overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 via-purple-900/30 to-green-900/30 flex items-center justify-center">
            <div className="text-center p-4">
              <p className="text-white text-sm mb-2">Discover high-potential investment areas</p>
              <Button 
                className="bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.3)] hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all duration-300"
                onClick={() => window.open('/properties', '_blank')}
              >
                View Interactive Map
              </Button>
            </div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="absolute w-12 h-12 bg-green-500 rounded-full opacity-30 blur-xl animate-pulse-slow" style={{ top: '40%', left: '60%' }}></div>
            <div className="absolute w-10 h-10 bg-blue-500 rounded-full opacity-30 blur-xl animate-pulse-slow" style={{ top: '30%', left: '40%', animationDelay: '1s' }}></div>
            <div className="absolute w-14 h-14 bg-purple-500 rounded-full opacity-30 blur-xl animate-pulse-slow" style={{ top: '60%', left: '30%', animationDelay: '2s' }}></div>
            <div className="absolute w-8 h-8 bg-yellow-500 rounded-full opacity-30 blur-xl animate-pulse-slow" style={{ top: '50%', left: '70%', animationDelay: '1.5s' }}></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
