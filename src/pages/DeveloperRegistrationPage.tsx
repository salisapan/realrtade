
import React from "react";
import { HomeHeader } from "@/components/layout/HomeHeader";
import RegistrationForm from "@/components/developer/RegistrationForm";

const DeveloperRegistrationPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-blue-50">
      <HomeHeader />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <RegistrationForm />
        </div>
      </main>
    </div>
  );
};

export default DeveloperRegistrationPage;
