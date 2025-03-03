
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
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-1.5">
          <Calculator className="h-4 w-4" />
          Investment Calculator
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="investment-amount" className="text-xs">Investment Amount ($)</Label>
            <div className="relative">
              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
              <Input
                id="investment-amount"
                type="number"
                min={minInvestment}
                step={1000}
                value={investmentAmount}
                onChange={handleAmountChange}
                className="pl-7 h-9 text-sm"
              />
            </div>
            <p className="text-xs text-gray-500">Minimum investment: ${minInvestment.toLocaleString()}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-gray-500 text-xs mb-1">Annual Return</div>
              <div className="text-base font-bold text-green-600">${returns.annual.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-0.5">{roi}% of investment</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-gray-500 text-xs mb-1">Total ({term} years)</div>
              <div className="text-base font-bold text-green-600">${returns.total.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-0.5">${(returns.total - investmentAmount).toLocaleString()} profit</div>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">Return Breakdown</span>
              <span className="text-xs text-gray-500">{term} year projection</span>
            </div>
            <div className="relative h-16 mt-1">
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
                    <span className="text-xs mt-0.5">Y{item.year}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Button size="sm" className="w-full mt-3 text-sm h-8">
            Invest Now <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
          
          <p className="text-xs text-gray-500 text-center mt-1.5">
            Investment opportunities involve risk, including possible loss of principal.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
