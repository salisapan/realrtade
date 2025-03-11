
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Calculator } from "lucide-react";

export const CashFlowSimulator = () => {
  const [propertyValue, setPropertyValue] = useState(300000);
  const [mortgageRate, setMortgageRate] = useState(4.5);
  const [rentalIncome, setRentalIncome] = useState(2200);
  const [expenses, setExpenses] = useState(600);
  
  const calculateMortgage = () => {
    const loanAmount = propertyValue * 0.8;
    const monthlyRate = mortgageRate / 100 / 12;
    const termMonths = 30 * 12;
    
    const monthlyPayment = 
      (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
      (Math.pow(1 + monthlyRate, termMonths) - 1);
      
    return Math.round(monthlyPayment);
  };
  
  const mortgagePayment = calculateMortgage();
  const cashFlow = rentalIncome - mortgagePayment - expenses;
  const annualCashFlow = cashFlow * 12;
  const cashOnCash = (annualCashFlow / (propertyValue * 0.2)) * 100;
  
  const data = [
    { name: 'Rental Income', amount: rentalIncome, color: '#3b82f6' },
    { name: 'Mortgage', amount: -mortgagePayment, color: '#ef4444' },
    { name: 'Expenses', amount: -expenses, color: '#f97316' },
    { name: 'Cash Flow', amount: cashFlow, color: cashFlow >= 0 ? '#22c55e' : '#ef4444' },
  ];

  return (
    <Card className="hover:shadow-md transition-all duration-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg text-gray-800 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-blue-500" />
          Cash Flow Simulator
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Property Value</label>
                <span className="text-sm font-bold">${propertyValue.toLocaleString()}</span>
              </div>
              <Slider 
                value={[propertyValue]} 
                min={100000} 
                max={1000000} 
                step={10000} 
                onValueChange={(value) => setPropertyValue(value[0])}
                className="hover:opacity-80 transition-opacity duration-300"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Mortgage Rate</label>
                <span className="text-sm font-bold">{mortgageRate}%</span>
              </div>
              <Slider 
                value={[mortgageRate]} 
                min={2} 
                max={8} 
                step={0.1} 
                onValueChange={(value) => setMortgageRate(value[0])}
                className="hover:opacity-80 transition-opacity duration-300"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Monthly Rental Income</label>
                <span className="text-sm font-bold">${rentalIncome}</span>
              </div>
              <Slider 
                value={[rentalIncome]} 
                min={500} 
                max={5000} 
                step={50} 
                onValueChange={(value) => setRentalIncome(value[0])}
                className="hover:opacity-80 transition-opacity duration-300"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Monthly Expenses</label>
                <span className="text-sm font-bold">${expenses}</span>
              </div>
              <Slider 
                value={[expenses]} 
                min={200} 
                max={2000} 
                step={50} 
                onValueChange={(value) => setExpenses(value[0])}
                className="hover:opacity-80 transition-opacity duration-300"
              />
            </div>
            
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Monthly Cash Flow</span>
                <span className={`text-sm font-bold ${cashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${cashFlow}
                </span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Annual Cash Flow</span>
                <span className={`text-sm font-bold ${annualCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${annualCashFlow}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Cash-on-Cash Return</span>
                <span className={`text-sm font-bold ${cashOnCash >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {cashOnCash.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-3 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis 
                  type="number"
                  tickFormatter={(value: number) => `$${Math.abs(value)}`}
                  domain={[
                    (dataMin: number) => Math.floor(Math.min(dataMin, -500) / 500) * 500,
                    (dataMax: number) => Math.ceil(Math.max(dataMax, 500) / 500) * 500
                  ]}
                />
                <YAxis dataKey="name" type="category" />
                <Tooltip 
                  formatter={(value: number) => [`$${Math.abs(value)}`, value >= 0 ? 'Income' : 'Expense']}
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                  }}
                />
                <ReferenceLine x={0} stroke="#888" />
                <Bar 
                  dataKey="amount"
                  radius={[4, 4, 4, 4]}
                  className="hover:opacity-80 transition-opacity duration-300"
                  fill="#3b82f6" // Use a default color
                >
                  {data.map((entry, index) => (
                    <cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
