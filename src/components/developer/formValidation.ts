
import { DeveloperFormData } from './types';

export const validateStep = (
  currentStep: number, 
  formData: DeveloperFormData
): Record<string, string> => {
  const errors: Record<string, string> = {};
  
  if (currentStep === 1) {
    if (!formData.fullName) errors.fullName = "Full name is required";
    if (!formData.email) errors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) errors.email = "Email is invalid";
    
    if (!formData.password) errors.password = "Password is required";
    else if (formData.password.length < 6) errors.password = "Password must be at least 6 characters";
    
    if (!formData.phone) errors.phone = "Phone number is required";
  }
  
  if (currentStep === 2) {
    if (!formData.companyName) errors.companyName = "Company name is required";
    if (!formData.roleInCompany) errors.roleInCompany = "Role in company is required";
    if (!formData.companyAddress) errors.companyAddress = "Company address is required";
    if (!formData.companyRegistrationNumber) errors.companyRegistrationNumber = "Company registration number is required";
    if (!formData.countryOfRegistration) errors.countryOfRegistration = "Country of registration is required";
    if (!formData.numberOfEmployees) errors.numberOfEmployees = "Number of employees is required";
    if (!formData.yearsInOperation) errors.yearsInOperation = "Years in operation is required";
    
    if (formData.website && !/^(http|https):\/\/[^ "]+$/.test(formData.website)) {
      errors.website = "Website must be a valid URL";
    }
  }
  
  if (currentStep === 3) {
    if (!formData.dealsCompleted) errors.dealsCompleted = "Number of deals is required";
    if (!formData.totalValueOfProjects) errors.totalValueOfProjects = "Total value is required";
    if (!formData.legalDisputes) errors.legalDisputes = "Please select an option";
    if (formData.legalDisputes === "yes" && !formData.legalDisputesExplanation) {
      errors.legalDisputesExplanation = "Please provide an explanation";
    }
    if (formData.propertySpecialization.length === 0) {
      errors.propertySpecialization = "Please select at least one property type";
    }
  }
  
  if (currentStep === 4) {
    if (!formData.backgroundCheckConsent) {
      errors.backgroundCheckConsent = "You must consent to background checks";
    }
    if (!formData.agreeTerms) {
      errors.agreeTerms = "You must agree to the terms and conditions";
    }
  }
  
  return errors;
};
