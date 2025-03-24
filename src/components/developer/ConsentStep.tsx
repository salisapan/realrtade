
import React from 'react';
import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ConsentStepProps {
  backgroundCheckConsent: boolean;
  setBackgroundCheckConsent: (value: boolean) => void;
  agreeTerms: boolean;
  setAgreeTerms: (value: boolean) => void;
  errors: Record<string, string>;
}

const ConsentStep: React.FC<ConsentStepProps> = ({
  backgroundCheckConsent,
  setBackgroundCheckConsent,
  agreeTerms,
  setAgreeTerms,
  errors,
}) => {
  return (
    <div className="space-y-6 animate-fadeIn">
      <h3 className="text-lg font-medium">Consent and Agreement</h3>
      
      <div className="bg-yellow-50 p-4 rounded-md">
        <div className="space-y-3">
          <div className="flex items-start space-x-2">
            <Checkbox 
              id="backgroundCheckConsent" 
              checked={backgroundCheckConsent}
              onCheckedChange={(checked) => setBackgroundCheckConsent(checked as boolean)}
              className={errors.backgroundCheckConsent ? "border-red-500" : ""}
            />
            <Label 
              htmlFor="backgroundCheckConsent" 
              className="text-sm text-yellow-800"
            >
              I authorize REALTRADE's representatives to conduct a credit check, legal background check, and due diligence on my company. <span className="text-red-500">*</span>
            </Label>
          </div>
          {errors.backgroundCheckConsent && (
            <p className="text-red-500 text-sm">{errors.backgroundCheckConsent}</p>
          )}
        </div>
      </div>
      
      <div className="bg-gray-50 p-4 rounded-md space-y-4">
        <div className="text-sm text-gray-700 space-y-2">
          <p>By accepting these terms, you acknowledge that:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>All information provided is accurate and complete</li>
            <li>You have the authority to represent your company on the REALTRADE platform</li>
            <li>You will promptly update any information that changes</li>
            <li>You understand that REALTRADE conducts thorough background checks</li>
            <li>Your company information may be displayed to potential investors</li>
            <li>REALTRADE reserves the right to reject applications that don't meet our standards</li>
          </ul>
        </div>
        
        <div className="flex items-start space-x-2">
          <Checkbox 
            id="agreeTerms" 
            checked={agreeTerms}
            onCheckedChange={(checked) => setAgreeTerms(checked as boolean)}
            className={errors.agreeTerms ? "border-red-500" : ""}
          />
          <Label 
            htmlFor="agreeTerms" 
            className="text-sm"
          >
            I agree to the <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>, <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>, and <Link to="/developer-terms" className="text-primary hover:underline">Developer Terms</Link> <span className="text-red-500">*</span>
          </Label>
        </div>
        {errors.agreeTerms && <p className="text-red-500 text-sm">{errors.agreeTerms}</p>}
      </div>
      
      <div className="bg-primary/10 p-4 rounded-md">
        <h4 className="text-sm font-medium text-primary mb-2">What happens next?</h4>
        <p className="text-sm text-gray-700">
          After submitting your application, our team will review your information within 1-3 business days. 
          You'll receive an email notification once your account is approved. 
          You can then log in and start listing your properties on the REALTRADE platform.
        </p>
      </div>
    </div>
  );
};

export default ConsentStep;
