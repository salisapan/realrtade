
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import CommunityForum from "./pages/CommunityForum";
import Recommendations from "./pages/Recommendations";
import Auth from "./pages/Auth";
import InvestorRegistrationPage from "./pages/InvestorRegistrationPage";
import DeveloperRegistrationPage from "./pages/DeveloperRegistrationPage";

// Admin Workspace Pages
import AdminPage from "./pages/admin/AdminPage";
import UsersPage from "./pages/admin/UsersPage";
import AnalyticsPage from "./pages/admin/AnalyticsPage";
import DomainsPage from "./pages/admin/DomainsPage";
import PaymentsPage from "./pages/admin/PaymentsPage";
import DataPropertyPage from "./pages/admin/DataPropertyPage";
import SettingsLogoPage from "./pages/admin/SettingsLogoPage";

const queryClient = new QueryClient();

// Function to check for active Supabase session
const hasRegistered = () => {
  return localStorage.getItem("investorProfile") !== null;
};

// Check if user is an accredited investor
const isAccreditedInvestor = () => {
  const profile = localStorage.getItem("investorProfile");
  if (!profile) return false;
  try {
    const parsedProfile = JSON.parse(profile);
    return parsedProfile.is_accredited === true;
  } catch (error) {
    console.error("Error parsing investor profile:", error);
    return false;
  }
};

// Protected route component
const ProtectedRoute = ({
  children
}: {
  children: React.ReactNode;
}) => {
  if (!hasRegistered()) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
};

// Accredited investor route
const AccreditedRoute = ({
  children
}: {
  children: React.ReactNode;
}) => {
  if (!hasRegistered()) {
    return <Navigate to="/auth" replace />;
  }
  
  if (!isAccreditedInvestor()) {
    return <Navigate to="/verified-deals" replace />;
  }
  
  return <>{children}</>;
};

// Admin protected route
const AdminRoute = ({
  children
}: {
  children: React.ReactNode;
}) => {
  // For demo purposes, we're allowing access without checks
  // In a real app, you would check if the user is an admin:
  // if (!isAdmin()) {
  //   return <Navigate to="/" replace />;
  // }
  return <>{children}</>;
};

const App = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for an active session when the app loads
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);

      // If we have a session, make sure we also have the profile in localStorage
      if (session?.user?.id) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
          .then(({ data, error }) => {
            if (data && !error) {
              localStorage.setItem("investorProfile", JSON.stringify(data));
            } else if (error) {
              console.error("Error fetching profile:", error);
            }
          });
      }
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      
      // If auth state changes to signed out, clear the profile
      if (!session) {
        localStorage.removeItem("investorProfile");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider className="min-h-screen flex w-full">
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/investor-registration" element={<InvestorRegistrationPage />} />
              <Route path="/developer-registration" element={<DeveloperRegistrationPage />} />
              <Route path="/investor-signup" element={<Navigate to="/investor-registration" replace />} />
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
                path="/recommendations" 
                element={
                  <ProtectedRoute>
                    <Recommendations />
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
                path="/community" 
                element={
                  <ProtectedRoute>
                    <CommunityForum />
                  </ProtectedRoute>
                } 
              />
              
              {/* Admin Workspace Routes */}
              <Route 
                path="/admin" 
                element={
                  <AdminRoute>
                    <AdminPage />
                  </AdminRoute>
                } 
              />
              <Route 
                path="/admin/users" 
                element={
                  <AdminRoute>
                    <UsersPage />
                  </AdminRoute>
                } 
              />
              <Route 
                path="/admin/analytics" 
                element={
                  <AdminRoute>
                    <AnalyticsPage />
                  </AdminRoute>
                } 
              />
              <Route 
                path="/admin/domains" 
                element={
                  <AdminRoute>
                    <DomainsPage />
                  </AdminRoute>
                } 
              />
              <Route 
                path="/admin/payments" 
                element={
                  <AdminRoute>
                    <PaymentsPage />
                  </AdminRoute>
                } 
              />
              <Route 
                path="/admin/data/property" 
                element={
                  <AdminRoute>
                    <DataPropertyPage />
                  </AdminRoute>
                } 
              />
              <Route 
                path="/admin/settings/logo" 
                element={
                  <AdminRoute>
                    <SettingsLogoPage />
                  </AdminRoute>
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
