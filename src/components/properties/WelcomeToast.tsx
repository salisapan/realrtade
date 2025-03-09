
import { useToast } from "@/hooks/use-toast";

export const useWelcomeToast = (isAccredited: boolean) => {
  const { toast } = useToast();

  // This function now does nothing - welcome toast has been removed
  const showWelcomeToast = () => {
    // Toast disabled as requested
    return;
  };

  return { showWelcomeToast };
};
