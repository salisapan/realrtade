
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";

const Wallet = () => {
  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50 p-8">
        <h1 className="text-2xl font-bold mb-6">Wallet</h1>
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-6 h-6" />
              Available Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">$125,000.00</div>
          </CardContent>
        </Card>

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
            <Card key={transaction.date + transaction.amount}>
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
      </div>
    </div>
  );
};

export default Wallet;
