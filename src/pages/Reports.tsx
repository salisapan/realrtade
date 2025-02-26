
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

const Reports = () => {
  const reports = [
    {
      title: "Q1 2024 Investment Summary",
      date: "2024-03-31",
      type: "Quarterly Report",
    },
    {
      title: "Annual Performance Review 2023",
      date: "2024-01-15",
      type: "Annual Report",
    },
    {
      title: "Property Assessment: Tech Hub Square",
      date: "2024-02-28",
      type: "Property Report",
    },
  ];

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50 p-8">
        <h1 className="text-2xl font-bold mb-6">Reports</h1>
        <div className="grid gap-6">
          {reports.map((report) => (
            <Card key={report.title}>
              <CardHeader className="flex flex-row items-center gap-4">
                <FileText className="w-8 h-8 text-primary" />
                <div>
                  <CardTitle className="text-lg">{report.title}</CardTitle>
                  <p className="text-sm text-gray-500">{report.date}</p>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">{report.type}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Reports;
