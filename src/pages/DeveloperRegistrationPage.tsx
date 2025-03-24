
  const handleNextStep = () => {
    if (validateStep(step)) {
      setStep(prev => prev + 1);
    }
  };
  
  const handlePrevStep = () => {
    setStep(prev => prev - 1);
  };
  
  const handleSpecializationChange = (typeId: string) => {
    setPropertySpecialization(current => {
      if (current.includes(typeId)) {
        return current.filter(id => id !== typeId);
      } else {
        return [...current, typeId];
      }
    });
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep(step)) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            user_type: "developer"
          },
        },
      });
      
      if (error) throw error;
      
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([
            { 
              id: data.user.id,
              full_name: fullName,
              email: email,
              phone: phone
            },
          ]);
        
        if (profileError) {
          console.error("Error creating profile:", profileError);
          throw profileError;
        }
        
        const { error: developerError } = await supabase
          .from('developers')
          .insert([
            { 
              id: data.user.id,
              full_name: fullName,
              email: email,
              company_name: companyName,
              role_in_company: roleInCompany,
              company_address: companyAddress,
              company_registration_number: companyRegistrationNumber,
              country_of_registration: countryOfRegistration,
              number_of_employees: numberOfEmployees,
              years_in_operation: yearsInOperation,
              past_projects: pastProjects,
              performance_metrics: performanceMetrics,
              website_url: website,
              phone: phone,
              deals_completed: dealsCompleted,
              total_value_of_projects: totalValueOfProjects,
              legal_disputes: legalDisputes === "yes",
              legal_disputes_explanation: legalDisputes === "yes" ? legalDisputesExplanation : "",
              property_specialization: propertySpecialization,
              background_check_consent: backgroundCheckConsent
            },
          ]);
        
        if (developerError) {
          console.error("Error creating developer profile:", developerError);
          throw developerError;
        }
        
        toast({
          title: "Developer registration successful!",
          description: "Your account is now pending approval. We'll review your information and contact you soon.",
        });
        
        setTimeout(() => {
          navigate("/entrepreneur");
        }, 1500);
      }
    } catch (error: any) {
      toast({
        title: "Registration failed",
        description: error.message || "An error occurred during registration",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };
