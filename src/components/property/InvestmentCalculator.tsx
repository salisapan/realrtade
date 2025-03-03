
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calculator, DollarSign, BarChart4, ArrowRight } from "lucide-react";

interface InvestmentCalculatorProps {
  roi: number;
  minInvestment: number;
  term: number;
}

export const InvestmentCalculator = ({ roi, minInvestment, term }: InvestmentCalculatorProps) => {
  const [investmentAmount, setInvestmentAmount] = useState<number>(minInvestment);
  const [returns, setReturns] = useState<{
    total: number;
    annual: number;
    breakdown: { year: number; value: number }[];
  }>({ total: 0, annual: 0, breakdown: [] });

  useEffect(() => {
    calculateReturns(investmentAmount);
  }, [investmentAmount, roi, term]);

  const calculateReturns = (amount: number) => {
    const annualReturn = amount * (roi / 100);
    const totalReturn = amount + (annualReturn * term);
    
    // Create yearly breakdown
    const breakdown = Array.from({ length: term }, (_, i) => {
      const year = i + 1;
      // Simple compound interest calculation for demonstration
      const value = amount * Math.pow(1 + (roi / 100), year);
      return { year, value: parseFloat(value.toFixed(2)) };
    });

    setReturns({
      total: parseFloat(totalReturn.toFixed(2)),
      annual: parseFloat(annualReturn.toFixed(2)),
      breakdown
    });
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      setInvestmentAmount(value);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Investment Calculator
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="investment-amount">Investment Amount ($)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                id="investment-amount"
                type="number"
                min={minInvestment}
                step={1000}
                value={investmentAmount}
                onChange={handleAmountChange}
                className="pl-9"
              />
            </div>
            <p className="text-xs text-gray-500">Minimum investment: ${minInvestment.toLocaleString()}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-gray-500 text-sm mb-1">Annual Return</div>
              <div className="text-xl font-bold text-green-600">${returns.annual.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">{roi}% of investment</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-gray-500 text-sm mb-1">Total Return ({term} years)</div>
              <div className="text-xl font-bold text-green-600">${returns.total.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">${(returns.total - investmentAmount).toLocaleString()} profit</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Return Breakdown</span>
              <span className="text-xs text-gray-500">{term} year projection</span>
            </div>
            <div className="relative h-24 mt-2">
              <div className="absolute inset-0 flex items-end">
                {returns.breakdown.map((item, index) => (
                  <div 
                    key={index} 
                    className="flex-1 flex flex-col items-center"
                  >
                    <div 
                      className="w-full bg-blue-500 opacity-80 rounded-t"
                      style={{ 
                        height: `${(item.value / (returns.breakdown[returns.breakdown.length - 1]?.value || 1)) * 100}%`,
                      }}
                    ></div>
                    <span className="text-xs mt-1">Y{item.year}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Button className="w-full mt-4">
            Invest Now <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          
          <p className="text-xs text-gray-500 text-center mt-2">
            Investment opportunities involve risk, including the possible loss of principal.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
