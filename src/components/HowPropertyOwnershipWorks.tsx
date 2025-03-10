
import { Button } from "@/components/ui/button";
import { Shield, FileText, TrendingUp, Building2 } from "lucide-react";

export const HowPropertyOwnershipWorks = () => {
  const handleDownloadCertificate = () => {
    // Create a sample certificate text
    const certificateText = `
      CERTIFICATE OF OWNERSHIP
      
      This certifies that Jane Doe owns 5% of
      Greenfield Industrial Park LLC
      
      Property: Greenfield Industrial Park
      Location: Dallas, TX
      Date: ${new Date().toLocaleDateString()}
      
      RealTrade - Invest in real estate worldwide from anywhere
    `;
    
    // Create a Blob with the certificate text
    const blob = new Blob([certificateText], { type: 'text/plain' });
    
    // Create a download link and trigger the download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_ownership_certificate.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="bg-white py-10 sm:py-16">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">How Property Ownership Works</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-blue-50 p-6 rounded-lg">
            <div className="flex items-center mb-4">
              <div className="bg-blue-100 p-2 rounded-full mr-3">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Reduced Legal Exposure</h3>
            </div>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Each property is held by a dedicated LLC</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Investors are shielded from property liabilities</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Limited personal risk exposure</span>
              </li>
            </ul>
          </div>
          
          <div className="bg-blue-50 p-6 rounded-lg">
            <div className="flex items-center mb-4">
              <div className="bg-blue-100 p-2 rounded-full mr-3">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Tax Advantages</h3>
            </div>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Pass-through taxation benefits</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Potential for depreciation write-offs</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Possible 1031 exchange eligibility</span>
              </li>
            </ul>
          </div>
          
          <div className="bg-blue-50 p-6 rounded-lg">
            <div className="flex items-center mb-4">
              <div className="bg-blue-100 p-2 rounded-full mr-3">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Simplified Ownership</h3>
            </div>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Proportional LLC ownership based on investment</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Professional property management included</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Easy transferability of ownership shares</span>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <h3 className="text-lg font-semibold mb-2">Sample Ownership Certificate</h3>
            <p className="text-gray-600 max-w-xl">
              Download a sample certificate showing how your ownership is documented,
              including your name, LLC percentage, and property details.
            </p>
          </div>
          <Button 
            onClick={handleDownloadCertificate}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Download Sample
          </Button>
        </div>
      </div>
    </div>
  );
};
