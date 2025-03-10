
import React from 'react';
import { FileDown, Shield, Receipt, PercentSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const HowPropertyOwnershipWorks = () => {
  return (
    <section className="bg-gray-50 py-12 px-4 md:px-8">
      <div className="container mx-auto">
        <h2 className="text-2xl font-bold text-center mb-10">How Property Ownership Works</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <Shield className="mr-2 text-primary h-5 w-5" />
                Reduced Legal Exposure
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-baseline">
                  <span className="text-primary mr-2">•</span>
                  <span>Each property is held by a dedicated LLC</span>
                </li>
                <li className="flex items-baseline">
                  <span className="text-primary mr-2">•</span>
                  <span>Investors are shielded from property liabilities</span>
                </li>
                <li className="flex items-baseline">
                  <span className="text-primary mr-2">•</span>
                  <span>Limited personal risk exposure</span>
                </li>
              </ul>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <Receipt className="mr-2 text-primary h-5 w-5" />
                Tax Advantages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-baseline">
                  <span className="text-primary mr-2">•</span>
                  <span>Pass-through taxation benefits</span>
                </li>
                <li className="flex items-baseline">
                  <span className="text-primary mr-2">•</span>
                  <span>Potential for depreciation write-offs</span>
                </li>
                <li className="flex items-baseline">
                  <span className="text-primary mr-2">•</span>
                  <span>Possible 1031 exchange eligibility</span>
                </li>
              </ul>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <PercentSquare className="mr-2 text-primary h-5 w-5" />
                Simplified Ownership
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-baseline">
                  <span className="text-primary mr-2">•</span>
                  <span>Proportional LLC ownership based on investment</span>
                </li>
                <li className="flex items-baseline">
                  <span className="text-primary mr-2">•</span>
                  <span>Professional property management included</span>
                </li>
                <li className="flex items-baseline">
                  <span className="text-primary mr-2">•</span>
                  <span>Easy transferability of ownership shares</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
        
        <div className="flex flex-col items-center justify-center">
          <h3 className="text-lg font-semibold mb-3">Sample Ownership Certificate</h3>
          <p className="text-gray-600 text-sm text-center max-w-lg mb-4">
            Download a sample certificate showing how your ownership is documented, including your name, LLC percentage, and property details.
          </p>
          <Button variant="outline" className="flex items-center">
            <FileDown className="mr-2 h-4 w-4" />
            Download Sample
          </Button>
        </div>
      </div>
    </section>
  );
};
