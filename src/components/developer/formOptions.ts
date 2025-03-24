
import { RoleOption, CountryOption, PropertyTypeOption } from './types';

export const roleOptions: RoleOption[] = [
  { value: "ceo", label: "CEO" },
  { value: "cfo", label: "CFO" },
  { value: "project_manager", label: "Project Manager" },
  { value: "other", label: "Other" }
];

export const countryOptions: CountryOption[] = [
  { value: "us", label: "United States" },
  { value: "ca", label: "Canada" },
  { value: "mx", label: "Mexico" },
  { value: "uk", label: "United Kingdom" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "jp", label: "Japan" },
  { value: "au", label: "Australia" },
  { value: "other", label: "Other" }
];

export const propertyTypes: PropertyTypeOption[] = [
  { id: "residential" as const, label: "Residential" },
  { id: "commercial" as const, label: "Commercial" },
  { id: "industrial" as const, label: "Industrial" },
  { id: "green" as const, label: "Green Real Estate" }
];
