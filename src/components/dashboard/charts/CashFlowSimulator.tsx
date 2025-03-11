
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { DollarSign, Percent, Home } from "lucide-react";

export const CashFlowSimulator = () => {
  const [purchasePrice, setPurchasePrice] = useState([350000]);
  const [interestRate, setInterestRate] = useState([5.5]);
  const [rentalIncome, setRentalIncome] = useState([2500]);

  // Calculate mortgage payment (simplistic)
  const calculateMortgage = () => {
    const p = purchasePrice[0]; // Principal
    const r = interestRate[0] / 100 / 12; // Monthly interest rate
    const n = 30 * 12; // Number of payments (30-year mortgage)
    
    // Monthly mortgage payment formula: P * (r * (1 + r)^n) / ((1 + r)^n - 1)
    const monthlyPayment = p * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    return Math.round(monthlyPayment);
  };

  // Estimate other expenses
  const taxes = Math.round(purchasePrice[0] * 0.015 / 12); // Annual property tax of 1.5%, divided by 12
  const insurance = Math.round(purchasePrice[0] * 0.005 / 12); // Annual insurance of 0.5%, divided by 12
  const maintenance = Math.round(purchasePrice[0] * 0.01 / 12); // Annual maintenance of 1%, divided by 12
  
  const mortgage = calculateMortgage();
  const totalExpenses = mortgage + taxes + insurance + maintenance;
  const cashFlow = rentalIncome[0] - totalExpenses;
  const cashOnCash = Math.round((cashFlow * 12) / (purchasePrice[0] * 0.2) * 100); // Assuming 20% down payment

  return (
    <Card className="bg-gray-800/50 backdrop-blur-md border border-gray-700 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
      <CardHeader>
        <CardTitle className="text-base md:text-lg text-white">Cash Flow Simulator</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-gray-300 flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Purchase Price
              </Label>
              <span className="text-blue-400 text-sm">${purchasePrice[0].toLocaleString()}</span>
            </div>
            <Slider 
              value={purchasePrice} 
              onValueChange={setPurchasePrice} 
              min={100000} 
              max={1000000} 
              step={10000} 
              className="cursor-pointer" 
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-gray-300 flex items-center gap-1">
                <Percent className="h-3 w-3" /> Interest Rate
              </Label>
              <span className="text-blue-400 text-sm">{interestRate[0]}%</span>
            </div>
            <Slider 
              value={interestRate} 
              onValueChange={setInterestRate} 
              min={2} 
              max={10} 
              step={0.1} 
              className="cursor-pointer" 
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-gray-300 flex items-center gap-1">
                <Home className="h-3 w-3" /> Monthly Rent
              </Label>
              <span className="text-blue-400 text-sm">${rentalIncome[0]}</span>
            </div>
            <Slider 
              value={rentalIncome} 
              onValueChange={setRentalIncome} 
              min={500} 
              max={7000} 
              step={100} 
              className="cursor-pointer" 
            />
          </div>
          
          <div className="mt-4 p-3 rounded-md bg-gray-900/70 border border-gray-700">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-gray-400">Monthly Mortgage:</div>
              <div className="text-right text-white">${mortgage}</div>
              
              <div className="text-gray-400">Property Taxes:</div>
              <div className="text-right text-white">${taxes}</div>
              
              <div className="text-gray-400">Insurance:</div>
              <div className="text-right text-white">${insurance}</div>
              
              <div className="text-gray-400">Maintenance:</div>
              <div className="text-right text-white">${maintenance}</div>
              
              <div className="text-gray-400 font-medium">Monthly Cash Flow:</div>
              <div className={`text-right font-medium ${cashFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${cashFlow}
              </div>
              
              <div className="text-gray-400 font-medium">Cash-on-Cash ROI:</div>
              <div className={`text-right font-medium ${cashOnCash >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {cashOnCash}%
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
