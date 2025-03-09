
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import Landing from "./pages/Landing";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Performance from "./pages/Performance";
import Reports from "./pages/Reports";
import Wallet from "./pages/Wallet";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import PropertyDetail from "./pages/PropertyDetail";
import EntrepreneurPortal from "./pages/EntrepreneurPortal";
import EntrepreneurRegistration from "./pages/EntrepreneurRegistration";
import DueDiligencePortal from "./pages/DueDiligencePortal";
import TransactionReports from "./pages/TransactionReports";
import InvestorSignup from "./pages/InvestorSignup";
import VerifiedDeals from "./pages/VerifiedDeals";
import WebCrawler from "./pages/WebCrawler";

const queryClient = new QueryClient();

// Check if user has completed registration - simplified to only check if profile exists
const hasRegistered = () => {
  return localStorage.getItem("investorProfile") !== null;
};

// Protected route component - now only checks if registration exists, not financial status
const ProtectedRoute = ({
  children
}: {
  children: React.ReactNode;
}) => {
  if (!hasRegistered()) {
    return <Navigate to="/investor-signup" replace />;
  }
  return <>{children}</>;
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider className="min-h-screen flex w-full">
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/investor-signup" element={<InvestorSignup />} />
              <Route path="/verified-deals" element={<VerifiedDeals />} />
              <Route 
                path="/properties" 
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/performance" 
                element={
                  <ProtectedRoute>
                    <Performance />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/reports" 
                element={
                  <ProtectedRoute>
                    <Reports />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/wallet" 
                element={
                  <ProtectedRoute>
                    <Wallet />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/settings" 
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/property/:id" 
                element={
                  <ProtectedRoute>
                    <PropertyDetail />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/entrepreneur" 
                element={
                  <ProtectedRoute>
                    <EntrepreneurPortal />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/entrepreneur/register" 
                element={
                  <ProtectedRoute>
                    <EntrepreneurRegistration />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/entrepreneur/due-diligence" 
                element={
                  <ProtectedRoute>
                    <DueDiligencePortal />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/entrepreneur/reports" 
                element={
                  <ProtectedRoute>
                    <TransactionReports />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/web-crawler" 
                element={
                  <ProtectedRoute>
                    <WebCrawler />
                  </ProtectedRoute>
                } 
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SidebarProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
