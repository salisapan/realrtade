
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PerformanceReportData {
  asset: string;
  invested: string;
  currentValue: string;
  roi: string;
  status: "positive" | "negative" | "neutral";
}

const reportData: PerformanceReportData[] = [
  {
    asset: "Downtown Office Complex",
    invested: "$125,000",
    currentValue: "$143,750",
    roi: "+15.0%",
    status: "positive",
  },
  {
    asset: "Riverside Apartments",
    invested: "$87,500",
    currentValue: "$96,250",
    roi: "+10.0%",
    status: "positive",
  },
  {
    asset: "Suburban Retail Center",
    invested: "$62,000",
    currentValue: "$59,520",
    roi: "-4.0%",
    status: "negative",
  },
  {
    asset: "Industrial Park",
    invested: "$110,000",
    currentValue: "$121,000",
    roi: "+10.0%",
    status: "positive",
  },
  {
    asset: "Mixed-Use Development",
    invested: "$95,000",
    currentValue: "$95,000",
    roi: "0.0%",
    status: "neutral",
  },
];

export const PerformanceReportTable = () => {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Invested Amount</TableHead>
            <TableHead>Current Value</TableHead>
            <TableHead>ROI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reportData.map((item) => (
            <TableRow key={item.asset}>
              <TableCell className="font-medium">{item.asset}</TableCell>
              <TableCell>{item.invested}</TableCell>
              <TableCell>{item.currentValue}</TableCell>
              <TableCell className={
                item.status === "positive" ? "text-green-600 font-medium" : 
                item.status === "negative" ? "text-red-600 font-medium" : ""
              }>
                {item.roi}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
