
import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { roleOptions, countryOptions } from './formOptions';

interface CompanyInfoStepProps {
  companyName: string;
  setCompanyName: (value: string) => void;
  roleInCompany: string;
  setRoleInCompany: (value: string) => void;
  companyAddress: string;
  setCompanyAddress: (value: string) => void;
  companyRegistrationNumber: string;
  setCompanyRegistrationNumber: (value: string) => void;
  countryOfRegistration: string;
  setCountryOfRegistration: (value: string) => void;
  numberOfEmployees: number | undefined;
  setNumberOfEmployees: (value: number | undefined) => void;
  yearsInOperation: number | undefined;
  setYearsInOperation: (value: number | undefined) => void;
  website: string;
  setWebsite: (value: string) => void;
  errors: Record<string, string>;
}

const CompanyInfoStep: React.FC<CompanyInfoStepProps> = ({
  companyName,
  setCompanyName,
  roleInCompany,
  setRoleInCompany,
  companyAddress,
  setCompanyAddress,
  companyRegistrationNumber,
  setCompanyRegistrationNumber,
  countryOfRegistration,
  setCountryOfRegistration,
  numberOfEmployees,
  setNumberOfEmployees,
  yearsInOperation,
  setYearsInOperation,
  website,
  setWebsite,
  errors,
}) => {
  return (
    <div className="space-y-6 animate-fadeIn">
      <h3 className="text-lg font-medium">Company Details</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">Company Name <span className="text-red-500">*</span></Label>
          <Input
            id="companyName"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            className={errors.companyName ? "border-red-500" : ""}
          />
          {errors.companyName && <p className="text-red-500 text-sm">{errors.companyName}</p>}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="roleInCompany">Role in Company <span className="text-red-500">*</span></Label>
          <Select
            value={roleInCompany}
            onValueChange={value => setRoleInCompany(value)}
          >
            <SelectTrigger className={errors.roleInCompany ? "border-red-500" : ""}>
              <SelectValue placeholder="Select your role" />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map(role => (
                <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.roleInCompany && <p className="text-red-500 text-sm">{errors.roleInCompany}</p>}
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="companyAddress">Company Address <span className="text-red-500">*</span></Label>
        <Input
          id="companyAddress"
          value={companyAddress}
          onChange={e => setCompanyAddress(e.target.value)}
          className={errors.companyAddress ? "border-red-500" : ""}
        />
        {errors.companyAddress && <p className="text-red-500 text-sm">{errors.companyAddress}</p>}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="companyRegistrationNumber">
            Company Registration Number <span className="text-red-500">*</span>
          </Label>
          <Input
            id="companyRegistrationNumber"
            value={companyRegistrationNumber}
            onChange={e => setCompanyRegistrationNumber(e.target.value)}
            className={errors.companyRegistrationNumber ? "border-red-500" : ""}
          />
          {errors.companyRegistrationNumber && (
            <p className="text-red-500 text-sm">{errors.companyRegistrationNumber}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="countryOfRegistration">
            Country of Company Registration <span className="text-red-500">*</span>
          </Label>
          <Select
            value={countryOfRegistration}
            onValueChange={value => setCountryOfRegistration(value)}
          >
            <SelectTrigger className={errors.countryOfRegistration ? "border-red-500" : ""}>
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {countryOptions.map(country => (
                <SelectItem key={country.value} value={country.value}>{country.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.countryOfRegistration && (
            <p className="text-red-500 text-sm">{errors.countryOfRegistration}</p>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="numberOfEmployees">
            Number of Employees <span className="text-red-500">*</span>
          </Label>
          <Input
            id="numberOfEmployees"
            type="number"
            min="1"
            value={numberOfEmployees || ""}
            onChange={e => setNumberOfEmployees(parseInt(e.target.value) || undefined)}
            className={errors.numberOfEmployees ? "border-red-500" : ""}
          />
          {errors.numberOfEmployees && (
            <p className="text-red-500 text-sm">{errors.numberOfEmployees}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="yearsInOperation">
            Years in Operation <span className="text-red-500">*</span>
          </Label>
          <Input
            id="yearsInOperation"
            type="number"
            min="0"
            value={yearsInOperation || ""}
            onChange={e => setYearsInOperation(parseInt(e.target.value) || undefined)}
            className={errors.yearsInOperation ? "border-red-500" : ""}
          />
          {errors.yearsInOperation && (
            <p className="text-red-500 text-sm">{errors.yearsInOperation}</p>
          )}
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="website">Website URL (Optional)</Label>
        <Input
          id="website"
          type="url"
          placeholder="https://www.example.com"
          value={website}
          onChange={e => setWebsite(e.target.value)}
          className={errors.website ? "border-red-500" : ""}
        />
        {errors.website && <p className="text-red-500 text-sm">{errors.website}</p>}
      </div>
    </div>
  );
};

export default CompanyInfoStep;
