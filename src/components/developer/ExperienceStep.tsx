
import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { propertyTypes } from './formOptions';

interface ExperienceStepProps {
  pastProjects: string;
  setPastProjects: (value: string) => void;
  performanceMetrics: string;
  setPerformanceMetrics: (value: string) => void;
  dealsCompleted: number | undefined;
  setDealsCompleted: (value: number | undefined) => void;
  totalValueOfProjects: number | undefined;
  setTotalValueOfProjects: (value: number | undefined) => void;
  legalDisputes: string | undefined;
  setLegalDisputes: (value: string | undefined) => void;
  legalDisputesExplanation: string;
  setLegalDisputesExplanation: (value: string) => void;
  propertySpecialization: string[];
  handleSpecializationChange: (typeId: string) => void;
  errors: Record<string, string>;
}

const ExperienceStep: React.FC<ExperienceStepProps> = ({
  pastProjects,
  setPastProjects,
  performanceMetrics,
  setPerformanceMetrics,
  dealsCompleted,
  setDealsCompleted,
  totalValueOfProjects,
  setTotalValueOfProjects,
  legalDisputes,
  setLegalDisputes,
  legalDisputesExplanation,
  setLegalDisputesExplanation,
  propertySpecialization,
  handleSpecializationChange,
  errors,
}) => {
  return (
    <div className="space-y-6 animate-fadeIn">
      <h3 className="text-lg font-medium">Developer Background</h3>
      
      <div className="space-y-2">
        <Label htmlFor="pastProjects">Past Projects (Optional)</Label>
        <Textarea
          id="pastProjects"
          placeholder="Briefly describe your previous real estate deals"
          value={pastProjects}
          onChange={e => setPastProjects(e.target.value)}
          className="min-h-[120px]"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="performanceMetrics">Performance Metrics (Optional)</Label>
        <Textarea
          id="performanceMetrics"
          placeholder="Share your average ROI, success rate, or notable achievements"
          value={performanceMetrics}
          onChange={e => setPerformanceMetrics(e.target.value)}
          className="min-h-[120px]"
        />
      </div>
      
      <Separator />
      
      <div className="space-y-2">
        <Label htmlFor="dealsCompleted">
          How many real estate deals have you completed in the past 5 years? <span className="text-red-500">*</span>
        </Label>
        <Input
          id="dealsCompleted"
          type="number"
          min="0"
          value={dealsCompleted || ""}
          onChange={e => setDealsCompleted(parseInt(e.target.value) || undefined)}
          className={errors.dealsCompleted ? "border-red-500" : ""}
        />
        {errors.dealsCompleted && <p className="text-red-500 text-sm">{errors.dealsCompleted}</p>}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="totalValueOfProjects">
          What is the total value of your completed projects? (USD) <span className="text-red-500">*</span>
        </Label>
        <Input
          id="totalValueOfProjects"
          type="number"
          min="0"
          value={totalValueOfProjects || ""}
          onChange={e => setTotalValueOfProjects(parseInt(e.target.value) || undefined)}
          className={errors.totalValueOfProjects ? "border-red-500" : ""}
        />
        {errors.totalValueOfProjects && (
          <p className="text-red-500 text-sm">{errors.totalValueOfProjects}</p>
        )}
      </div>
      
      <div className="space-y-3">
        <Label>
          Have you ever faced legal disputes related to your projects? <span className="text-red-500">*</span>
        </Label>
        <RadioGroup
          value={legalDisputes}
          onValueChange={value => setLegalDisputes(value)}
          className={errors.legalDisputes ? "border border-red-500 rounded-md p-3" : ""}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id="disputes-yes" />
            <Label htmlFor="disputes-yes">Yes</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id="disputes-no" />
            <Label htmlFor="disputes-no">No</Label>
          </div>
        </RadioGroup>
        {errors.legalDisputes && <p className="text-red-500 text-sm">{errors.legalDisputes}</p>}
        
        {legalDisputes === "yes" && (
          <div className="space-y-2 mt-3">
            <Label htmlFor="legalDisputesExplanation">
              Please explain <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="legalDisputesExplanation"
              value={legalDisputesExplanation}
              onChange={e => setLegalDisputesExplanation(e.target.value)}
              className={errors.legalDisputesExplanation ? "border-red-500 min-h-[100px]" : "min-h-[100px]"}
            />
            {errors.legalDisputesExplanation && (
              <p className="text-red-500 text-sm">{errors.legalDisputesExplanation}</p>
            )}
          </div>
        )}
      </div>
      
      <div className="space-y-3">
        <Label>
          What types of properties do you specialize in? <span className="text-red-500">*</span>
        </Label>
        <div className={`grid grid-cols-2 gap-3 ${errors.propertySpecialization ? "border border-red-500 rounded-md p-3" : ""}`}>
          {propertyTypes.map(type => (
            <div key={type.id} className="flex items-center space-x-2">
              <Checkbox
                id={`type-${type.id}`}
                checked={propertySpecialization.includes(type.id)}
                onCheckedChange={() => handleSpecializationChange(type.id)}
              />
              <Label htmlFor={`type-${type.id}`}>{type.label}</Label>
            </div>
          ))}
        </div>
        {errors.propertySpecialization && (
          <p className="text-red-500 text-sm">{errors.propertySpecialization}</p>
        )}
      </div>
    </div>
  );
};

export default ExperienceStep;
