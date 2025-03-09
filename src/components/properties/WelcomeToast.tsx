
import { useToast } from "@/hooks/use-toast";

export const useWelcomeToast = (isAccredited: boolean) => {
  const { toast } = useToast();

  const showWelcomeToast = () => {
    if (isAccredited) {
      toast({
        title: "Welcome Accredited Investor",
        description: "You're viewing all available investment properties."
      });
    } else {
      toast({
        title: "Welcome to RealTrade",
        description: "You're viewing verified properties with low minimum investments of just $10."
      });
    }
  };

  return { showWelcomeToast };
};
