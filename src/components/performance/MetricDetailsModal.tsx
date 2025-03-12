
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";

interface MetricDetailsModalProps {
  open: boolean;
  onClose: () => void;
  metric: {
    name: string;
    currentValue: string;
    change: string;
    description: string;
    formula: string;
    historicalData: Array<{
      date: string;
      value: number;
    }>;
  };
}

export const MetricDetailsModal = ({ open, onClose, metric }: MetricDetailsModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            {metric.name}
            <span className={`text-sm font-normal ${metric.change.includes('+') ? 'text-green-600' : 'text-red-600'}`}>
              ({metric.change})
            </span>
          </DialogTitle>
          <DialogDescription className="text-base">
            Current Value: <span className="font-semibold">{metric.currentValue}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Formula and Description */}
          <Card className="p-4 bg-blue-50/50">
            <h3 className="font-semibold mb-2">How it's calculated</h3>
            <p className="text-sm text-gray-600 mb-3">{metric.description}</p>
            <div className="bg-white p-3 rounded-md">
              <code className="text-sm text-blue-600">{metric.formula}</code>
            </div>
          </Card>

          {/* Historical Chart */}
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metric.historicalData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.375rem'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6, fill: "#1d4ed8" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Historical Data Table */}
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metric.historicalData.map((data, index) => {
                  const prevValue = index > 0 ? metric.historicalData[index - 1].value : data.value;
                  const change = ((data.value - prevValue) / prevValue * 100).toFixed(2);
                  return (
                    <TableRow key={data.date}>
                      <TableCell>{data.date}</TableCell>
                      <TableCell>{data.value.toFixed(2)}%</TableCell>
                      <TableCell className={Number(change) >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {change}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
