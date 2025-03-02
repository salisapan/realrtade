
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ArrowUpRight, ArrowDownRight, LineChart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const Wallet = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleTransaction = (property: string) => {
    if (property === "Bank Transfer") {
      toast({
        title: "Bank Transfer",
        description: "Opening bank transfer dialog...",
      });
    } else {
      navigate(`/properties`);
    }
  };

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50 p-8">
        <h1 className="text-2xl font-bold mb-6">Wallet</h1>
        
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-6 h-6" />
                Available Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">$125,000.00</div>
              <div className="mt-4 space-x-4">
                <Button onClick={() => {
                  toast({
                    title: "Deposit",
                    description: "Opening deposit dialog...",
                  });
                }}>
                  Deposit
                </Button>
                <Button variant="outline" onClick={() => {
                  toast({
                    title: "Withdraw",
                    description: "Opening withdrawal dialog...",
                  });
                }}>
                  Withdraw
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LineChart className="w-6 h-6" />
                Investment Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Total Invested</span>
                  <span className="font-bold">$450,000.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Returns</span>
                  <span className="font-bold text-green-600">+$82,500.00</span>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full mt-4"
                  onClick={() => navigate('/performance')}
                >
                  View Performance Details
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>
        <div className="space-y-4">
          {[
            {
              type: "Investment",
              amount: "-50,000.00",
              property: "Tech Hub Square",
              date: "2024-03-15",
              isDebit: true,
            },
            {
              type: "Return",
              amount: "+12,500.00",
              property: "401 N Michigan Ave",
              date: "2024-03-10",
              isDebit: false,
            },
            {
              type: "Deposit",
              amount: "+100,000.00",
              property: "Bank Transfer",
              date: "2024-03-01",
              isDebit: false,
            },
          ].map((transaction) => (
            <Card 
              key={transaction.date + transaction.amount}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleTransaction(transaction.property)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-full ${
                    transaction.isDebit ? 'bg-red-100' : 'bg-green-100'
                  }`}>
                    {transaction.isDebit ? (
                      <ArrowUpRight className={`w-4 h-4 text-red-600`} />
                    ) : (
                      <ArrowDownRight className={`w-4 h-4 text-green-600`} />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{transaction.type}</p>
                    <p className="text-sm text-gray-500">{transaction.property}</p>
                  </div>
                </div>
                <div>
                  <p className={`font-medium ${
                    transaction.isDebit ? 'text-red-600' : 'text-green-600'
                  }`}>
                    ${transaction.amount}
                  </p>
                  <p className="text-sm text-gray-500">{transaction.date}</p>
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
  );
};

export default Wallet;
