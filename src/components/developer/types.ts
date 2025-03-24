
export type PropertyType = 'residential' | 'commercial' | 'industrial' | 'green';

export interface RoleOption {
  value: string;
  label: string;
}

export interface CountryOption {
  value: string;
  label: string;
}

export interface PropertyTypeOption {
  id: PropertyType;
  label: string;
}

export interface DeveloperFormData {
  // Personal info
  fullName: string;
  email: string;
  password: string;
  phone: string;
  
  // Company info
  companyName: string;
  roleInCompany: string;
  companyAddress: string;
  companyRegistrationNumber: string;
  countryOfRegistration: string;
  numberOfEmployees?: number;
  yearsInOperation?: number;
  website: string;
  
  // Experience
  pastProjects: string;
  performanceMetrics: string;
  dealsCompleted?: number;
  totalValueOfProjects?: number;
  legalDisputes?: string;
  legalDisputesExplanation: string;
  propertySpecialization: string[];
  
  // Consent
  backgroundCheckConsent: boolean;
  agreeTerms: boolean;
}
