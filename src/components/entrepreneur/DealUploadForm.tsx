
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type DealUploadFormProps = {
  onDealSubmitted?: () => void;
};

export const DealUploadForm = ({ onDealSubmitted }: DealUploadFormProps) => {
  const [uploadStep, setUploadStep] = useState(1);
  const [dealName, setDealName] = useState("");
  const [location, setLocation] = useState("");
  const [dealType, setDealType] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [targetROI, setTargetROI] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [fundingGoal, setFundingGoal] = useState("");
  const [minInvestment, setMinInvestment] = useState("");
  const [fundingPeriod, setFundingPeriod] = useState("");
  const [expectedTerm, setExpectedTerm] = useState("");

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleNextStep = () => {
    // Validate current step before proceeding
    if (uploadStep === 1 && (!dealName || !location || !dealType)) {
      toast({
        title: "Missing Information",
        description: "Please fill out all required fields before proceeding.",
        variant: "destructive",
      });
      return;
    }

    if (uploadStep === 2 && (!price || !targetROI || !fundingGoal)) {
      toast({
        title: "Missing Information",
        description: "Please fill out all required financial details before proceeding.",
        variant: "destructive",
      });
      return;
    }

    setUploadStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setUploadStep(prev => Math.max(1, prev - 1));
  };

  const handleSubmitDeal = () => {
    // Validate and submit form
    if (!dealName || !location || !dealType || !price || !targetROI || !fundingGoal) {
      toast({
        title: "Incomplete Form",
        description: "Please fill out all required fields before submitting.",
        variant: "destructive",
      });
      return;
    }

    // Here you would submit to your backend API
    console.log("Submitting deal:", {
      dealName,
      location,
      dealType,
      description,
      price,
      targetROI,
      fundingGoal,
      minInvestment,
      fundingPeriod,
      expectedTerm,
      image: selectedImage
    });

    toast({
      title: "Deal Submitted",
      description: "Your deal has been submitted successfully!",
      variant: "default", // Changed from "success" to "default"
    });

    // Reset form
    setUploadStep(1);
    setDealName("");
    setLocation("");
    setDealType("");
    setDescription("");
    setPrice("");
    setTargetROI("");
    setSelectedImage(null);
    setPreviewUrl("");
    setFundingGoal("");
    setMinInvestment("");
    setFundingPeriod("");
    setExpectedTerm("");

    // Notify parent component
    if (onDealSubmitted) {
      onDealSubmitted();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Upload New Deal</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Step {uploadStep} of 3</span>
        </div>
      </div>

      {uploadStep === 1 && (
        <div className="space-y-6">
          <h3 className="text-lg font-medium">Basic Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="deal-name">Deal Name*</Label>
              <Input 
                id="deal-name" 
                placeholder="Enter deal name" 
                value={dealName}
                onChange={(e) => setDealName(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="location">Location*</Label>
              <Input 
                id="location" 
                placeholder="City, State, Country" 
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="deal-type">Deal Type*</Label>
              <Input 
                id="deal-type" 
                placeholder="Commercial, Residential, etc." 
                value={dealType}
                onChange={(e) => setDealType(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="property-image">Property Image</Label>
              <div className="flex items-center gap-4">
                <Input 
                  id="property-image" 
                  type="file" 
                  accept="image/*"
                  onChange={handleImageChange}
                />
                {previewUrl && (
                  <div className="h-20 w-20 overflow-hidden rounded-md border">
                    <img 
                      src={previewUrl} 
                      alt="Property preview" 
                      className="h-full w-full object-cover" 
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea 
              id="description" 
              placeholder="Describe the property and investment opportunity" 
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleNextStep} className="flex items-center gap-2">
              Next <PlusCircle className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {uploadStep === 2 && (
        <div className="space-y-6">
          <h3 className="text-lg font-medium">Financial Details</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="price">Price (USD)*</Label>
              <Input 
                id="price" 
                placeholder="e.g. 2,500,000" 
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="target-roi">Target ROI (%)*</Label>
              <Input 
                id="target-roi" 
                placeholder="e.g. 12.5" 
                value={targetROI}
                onChange={(e) => setTargetROI(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="funding-goal">Funding Goal (USD)*</Label>
              <Input 
                id="funding-goal" 
                placeholder="e.g. 1,800,000" 
                value={fundingGoal}
                onChange={(e) => setFundingGoal(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="min-investment">Minimum Investment (USD)</Label>
              <Input 
                id="min-investment" 
                placeholder="e.g. 10,000" 
                value={minInvestment}
                onChange={(e) => setMinInvestment(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="funding-period">Funding Period (days)</Label>
              <Input 
                id="funding-period" 
                placeholder="e.g. 90" 
                value={fundingPeriod}
                onChange={(e) => setFundingPeriod(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="expected-term">Expected Term (years)</Label>
              <Input 
                id="expected-term" 
                placeholder="e.g. 5" 
                value={expectedTerm}
                onChange={(e) => setExpectedTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={handlePrevStep} className="flex items-center gap-2">
              Back
            </Button>
            <Button onClick={handleNextStep} className="flex items-center gap-2">
              Next <PlusCircle className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {uploadStep === 3 && (
        <div className="space-y-6">
          <h3 className="text-lg font-medium">Documents & Submission</h3>
          
          <div className="space-y-4">
            <div className="border rounded-md p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span>Property Appraisal</span>
                </div>
                <Button variant="outline" size="sm">Upload</Button>
              </div>
            </div>
            
            <div className="border rounded-md p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span>Financial Projections</span>
                </div>
                <Button variant="outline" size="sm">Upload</Button>
              </div>
            </div>
            
            <div className="border rounded-md p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span>Legal Documents</span>
                </div>
                <Button variant="outline" size="sm">Upload</Button>
              </div>
            </div>
            
            <div className="border rounded-md p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span>Market Analysis</span>
                </div>
                <Button variant="outline" size="sm">Upload</Button>
              </div>
            </div>
          </div>

          <div className="flex justify-between mt-8">
            <Button variant="outline" onClick={handlePrevStep}>
              Back
            </Button>
            <Button onClick={handleSubmitDeal} className="flex items-center gap-2">
              Submit Deal <Save className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
