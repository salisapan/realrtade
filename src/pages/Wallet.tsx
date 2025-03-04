
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DollarSign, ArrowUpRight, ArrowDownRight, LineChart, PieChart, Wallet as WalletIcon, Plus, ArrowDown, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";

const Wallet = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleTransaction = (property: string, transactionType: string) => {
    if (property === "Bank Transfer") {
      toast({
        title: "Bank Transfer",
        description: "Opening bank transfer dialog...",
      });
    } else if (transactionType === "Investment") {
      navigate(`/property/${property.replace(/\s+/g, '-').toLowerCase()}`);
    } else if (transactionType === "Return") {
      toast({
        title: "Investment Return",
        description: `Viewing details for return from ${property}...`,
      });
      navigate(`/performance`);
    } else {
      navigate(`/properties`);
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-50">
      <AppSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto">
          <header className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                  <WalletIcon className="w-5 h-5 text-primary" />
                  My Wallet
                </h1>
                <p className="text-gray-500 text-sm">
                  Manage your investments and track your returns
                </p>
              </div>
              <div className="flex gap-3">
                <Button onClick={() => navigate('/performance')}>
                  <LineChart className="mr-2 h-4 w-4" />
                  Performance Dashboard
                </Button>
              </div>
            </div>
          </header>
          
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 mb-8">
            <Card className="lg:col-span-2 overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader className="bg-gray-50 border-b">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                  Available Balance
                </CardTitle>
                <CardDescription>
                  Your current available balance for investments
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-6">
                  <div className="text-4xl font-bold">$125,000.00</div>
                  <div className="text-sm text-gray-500 mt-1">Updated 2 hours ago</div>
                  <div className="h-1 w-full bg-gray-200 rounded-full mt-4">
                    <div className="h-1 bg-primary rounded-full" style={{ width: "65%" }}></div>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-500">Available: 65%</span>
                    <span className="text-xs text-gray-500">Invested: 35%</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button className="flex items-center" onClick={() => {
                    toast({
                      title: "Deposit",
                      description: "Opening deposit dialog...",
                    });
                  }}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Deposit Funds
                  </Button>
                  <Button variant="outline" onClick={() => {
                    toast({
                      title: "Withdraw",
                      description: "Opening withdrawal dialog...",
                    });
                  }}>
                    <ArrowDown className="mr-1.5 h-4 w-4" />
                    Withdraw
                  </Button>
                  <Button variant="secondary" onClick={() => navigate('/properties')}>
                    Find Investments
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden hover:shadow-md transition-shadow h-full">
              <CardHeader className="bg-gray-50 border-b">
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-primary" />
                  Investment Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Invested</span>
                    <span className="font-bold">$450,000.00</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Returns</span>
                    <span className="font-bold text-green-600">+$82,500.00</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Active Investments</span>
                    <span className="font-bold">8</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Avg. ROI</span>
                    <span className="font-bold text-green-600">18.3%</span>
                  </div>
                  
                  <div className="pt-4 mt-2 border-t">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-gray-500">Portfolio Allocation</span>
                    </div>
                    <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-4">
                      <div className="bg-primary h-full" style={{ width: "40%" }}></div>
                      <div className="bg-secondary h-full" style={{ width: "25%" }}></div>
                      <div className="bg-green-500 h-full" style={{ width: "20%" }}></div>
                      <div className="bg-amber-500 h-full" style={{ width: "15%" }}></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-primary rounded-full"></div>
                        <span>Residential (40%)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-secondary rounded-full"></div>
                        <span>Commercial (25%)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span>Industrial (20%)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                        <span>Retail (15%)</span>
                      </div>
                    </div>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    className="w-full mt-2"
                    onClick={() => navigate('/performance')}
                  >
                    View Performance Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-xl font-semibold">Recent Transactions</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs h-8">
                All Transactions
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-8">
                <Clock className="mr-1 h-3 w-3" />
                Last 30 Days
              </Button>
            </div>
          </div>
          
          <div className="space-y-3">
            {[
              {
                type: "Investment",
                amount: "-50,000.00",
                property: "Tech Hub Square",
                date: "2024-03-15",
                isDebit: true,
                status: "Processing",
              },
              {
                type: "Return",
                amount: "+12,500.00",
                property: "401 N Michigan Ave",
                date: "2024-03-10",
                isDebit: false,
                status: "Completed",
              },
              {
                type: "Deposit",
                amount: "+100,000.00",
                property: "Bank Transfer",
                date: "2024-03-01",
                isDebit: false,
                status: "Completed",
              },
            ].map((transaction) => (
              <Card 
                key={transaction.date + transaction.amount}
                className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                onClick={() => handleTransaction(transaction.property, transaction.type)}
              >
                <CardContent className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${
                      transaction.isDebit ? 'bg-red-100' : 'bg-green-100'
                    }`}>
                      {transaction.isDebit ? (
                        <ArrowUpRight className={`w-5 h-5 text-red-600`} />
                      ) : (
                        <ArrowDownRight className={`w-5 h-5 text-green-600`} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{transaction.type}</p>
                        <Badge 
                          variant={transaction.status === "Completed" ? "success" : "outline"}
                          className="text-[10px] h-4"
                        >
                          {transaction.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">{transaction.property}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <p className={`font-medium ${
                      transaction.isDebit ? 'text-red-600' : 'text-green-600'
                    }`}>
                      ${transaction.amount}
                    </p>
                    <p className="text-xs text-gray-500">{new Date(transaction.date).toLocaleDateString()}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6 text-center">
            <Button 
              variant="outline"
              onClick={() => {
                toast({
                  title: "Transaction History",
                  description: "Loading full transaction history...",
                });
              }}
            >
              View All Transactions
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Wallet;
