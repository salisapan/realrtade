
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Check } from "lucide-react";
import PersonalInfoStep from "./PersonalInfoStep";
import CompanyInfoStep from "./CompanyInfoStep";
import ExperienceStep from "./ExperienceStep";
import ConsentStep from "./ConsentStep";
import ProgressHeader from "./ProgressHeader";
import { validateStep } from "./formValidation";
import { DeveloperFormData } from "./types";

const RegistrationForm: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Form data
  const [formData, setFormData] = useState<DeveloperFormData>({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    companyName: "",
    roleInCompany: "",
    companyAddress: "",
    companyRegistrationNumber: "",
    countryOfRegistration: "",
    numberOfEmployees: undefined,
    yearsInOperation: undefined,
    website: "",
    pastProjects: "",
    performanceMetrics: "",
    dealsCompleted: undefined,
    totalValueOfProjects: undefined,
    legalDisputes: undefined,
    legalDisputesExplanation: "",
    propertySpecialization: [],
    backgroundCheckConsent: false,
    agreeTerms: false
  });
  
  // Utility functions
  const updateFormData = <T extends keyof DeveloperFormData>(field: T, value: DeveloperFormData[T]) => {
    setFormData({ ...formData, [field]: value });
  };
  
  const handleSpecializationChange = (typeId: string) => {
    const newSpecialization = [...formData.propertySpecialization];
    if (newSpecialization.includes(typeId)) {
      updateFormData('propertySpecialization', newSpecialization.filter(id => id !== typeId));
    } else {
      updateFormData('propertySpecialization', [...newSpecialization, typeId]);
    }
  };
  
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };
  
  const handleNextStep = () => {
    const newErrors = validateStep(step, formData);
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length === 0) {
      setStep(prev => prev + 1);
    }
  };
  
  const handlePrevStep = () => {
    setStep(prev => prev - 1);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors = validateStep(step, formData);
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            user_type: "developer"
          },
        },
      });
      
      if (error) throw error;
      
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            full_name: formData.fullName,
            email: formData.email,
            phone: formData.phone
          });
        
        if (profileError) {
          console.error("Error creating profile:", profileError);
          throw profileError;
        }
        
        const { error: developerError } = await supabase
          .from('developers')
          .insert({
            id: data.user.id,
            full_name: formData.fullName,
            email: formData.email,
            company_name: formData.companyName,
            role_in_company: formData.roleInCompany,
            company_address: formData.companyAddress,
            company_registration_number: formData.companyRegistrationNumber,
            country_of_registration: formData.countryOfRegistration,
            number_of_employees: formData.numberOfEmployees,
            years_in_operation: formData.yearsInOperation,
            past_projects: formData.pastProjects,
            performance_metrics: formData.performanceMetrics,
            website_url: formData.website,
            phone: formData.phone,
            deals_completed: formData.dealsCompleted,
            total_value_of_projects: formData.totalValueOfProjects,
            legal_disputes: formData.legalDisputes === "yes",
            legal_disputes_explanation: formData.legalDisputes === "yes" ? formData.legalDisputesExplanation : "",
            property_specialization: formData.propertySpecialization,
            background_check_consent: formData.backgroundCheckConsent
          });
        
        if (developerError) {
          console.error("Error creating developer profile:", developerError);
          throw developerError;
        }
        
        toast({
          title: "Developer registration successful!",
          description: "Your account is now pending approval. We'll review your information and contact you soon.",
        });
        
        setTimeout(() => {
          navigate("/entrepreneur");
        }, 1500);
      }
    } catch (error: any) {
      toast({
        title: "Registration failed",
        description: error.message || "An error occurred during registration",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Render form step content
  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <PersonalInfoStep
            fullName={formData.fullName}
            setFullName={(value) => updateFormData('fullName', value)}
            email={formData.email}
            setEmail={(value) => updateFormData('email', value)}
            password={formData.password}
            setPassword={(value) => updateFormData('password', value)}
            phone={formData.phone}
            setPhone={(value) => updateFormData('phone', value)}
            showPassword={showPassword}
            togglePasswordVisibility={togglePasswordVisibility}
            errors={errors}
          />
        );
      case 2:
        return (
          <CompanyInfoStep
            companyName={formData.companyName}
            setCompanyName={(value) => updateFormData('companyName', value)}
            roleInCompany={formData.roleInCompany}
            setRoleInCompany={(value) => updateFormData('roleInCompany', value)}
            companyAddress={formData.companyAddress}
            setCompanyAddress={(value) => updateFormData('companyAddress', value)}
            companyRegistrationNumber={formData.companyRegistrationNumber}
            setCompanyRegistrationNumber={(value) => updateFormData('companyRegistrationNumber', value)}
            countryOfRegistration={formData.countryOfRegistration}
            setCountryOfRegistration={(value) => updateFormData('countryOfRegistration', value)}
            numberOfEmployees={formData.numberOfEmployees}
            setNumberOfEmployees={(value) => updateFormData('numberOfEmployees', value)}
            yearsInOperation={formData.yearsInOperation}
            setYearsInOperation={(value) => updateFormData('yearsInOperation', value)}
            website={formData.website}
            setWebsite={(value) => updateFormData('website', value)}
            errors={errors}
          />
        );
      case 3:
        return (
          <ExperienceStep
            pastProjects={formData.pastProjects}
            setPastProjects={(value) => updateFormData('pastProjects', value)}
            performanceMetrics={formData.performanceMetrics}
            setPerformanceMetrics={(value) => updateFormData('performanceMetrics', value)}
            dealsCompleted={formData.dealsCompleted}
            setDealsCompleted={(value) => updateFormData('dealsCompleted', value)}
            totalValueOfProjects={formData.totalValueOfProjects}
            setTotalValueOfProjects={(value) => updateFormData('totalValueOfProjects', value)}
            legalDisputes={formData.legalDisputes}
            setLegalDisputes={(value) => updateFormData('legalDisputes', value)}
            legalDisputesExplanation={formData.legalDisputesExplanation}
            setLegalDisputesExplanation={(value) => updateFormData('legalDisputesExplanation', value)}
            propertySpecialization={formData.propertySpecialization}
            handleSpecializationChange={handleSpecializationChange}
            errors={errors}
          />
        );
      case 4:
        return (
          <ConsentStep
            backgroundCheckConsent={formData.backgroundCheckConsent}
            setBackgroundCheckConsent={(value) => updateFormData('backgroundCheckConsent', value)}
            agreeTerms={formData.agreeTerms}
            setAgreeTerms={(value) => updateFormData('agreeTerms', value)}
            errors={errors}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Card className="shadow-[0_4px_24px_rgba(66,133,244,0.15)] overflow-hidden border-0">
      <ProgressHeader step={step} totalSteps={4} />
      
      <form onSubmit={handleSubmit}>
        <CardContent className="p-6">
          {renderStepContent()}
        </CardContent>
        
        <CardFooter className="flex justify-between p-6 border-t bg-gray-50">
          {step > 1 ? (
            <Button 
              type="button" 
              variant="outline" 
              onClick={handlePrevStep}
              disabled={isLoading}
            >
              Back
            </Button>
          ) : (
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => navigate('/auth')}
            >
              LOGIN
            </Button>
          )}
          
          {step < 4 ? (
            <Button 
              type="button"
              onClick={handleNextStep}
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button 
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <>Processing...</>
              ) : (
                <>
                  Complete Registration
                  <Check className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
};

export default RegistrationForm;
