import { PresentationContainer } from "../PresentationContainer";
import { Mail, Phone, MapPin, ArrowRight } from "lucide-react";

export const ContactSlide = () => {
  return (
    <PresentationContainer>
      <div className="space-y-8">
        {/* Logo */}
        <div className="text-center">
          <img
            src="/as-is-logo.jpeg"
            alt="AS IS Group Logo"
            className="h-20 w-20 mx-auto object-contain drop-shadow-lg mb-4"
          />
        </div>
        <div className="text-center">
          <h2 className="text-4xl font-bold text-foreground mb-2">
            בואו נדבר
          </h2>
          <p className="text-foreground/60 mb-4">
            אנחנו כאן כדי לענות על כל שאלה ותהייה שלכם
          </p>
          <p className="text-xs text-foreground/40 mb-6">
            AS IS GROUP - מנהלת התחדשות עירונית
          </p>
        </div>

        {/* Contact Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-6 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent hover:border-primary/50 transition-all text-center group">
            <div className="p-3 bg-gradient-to-br from-primary to-secondary rounded-lg w-fit mx-auto mb-3 group-hover:shadow-lg transition-shadow">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">דוא״ל</h3>
            <p className="text-sm text-primary hover:text-primary/80">
              sal@as-isgroup.com
            </p>
          </div>

          <div className="p-6 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent hover:border-primary/50 transition-all text-center group">
            <div className="p-3 bg-gradient-to-br from-primary to-secondary rounded-lg w-fit mx-auto mb-3 group-hover:shadow-lg transition-shadow">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">טלפון</h3>
            <p className="text-sm text-primary hover:text-primary/80">
              +972 54 XXX XXXX
            </p>
          </div>

          <div className="p-6 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent hover:border-primary/50 transition-all text-center group">
            <div className="p-3 bg-gradient-to-br from-primary to-secondary rounded-lg w-fit mx-auto mb-3 group-hover:shadow-lg transition-shadow">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">משרד</h3>
            <p className="text-sm text-foreground/70">
              תל אביב, ישראל
            </p>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/30 rounded-lg p-8">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                1
              </div>
              <div>
                <h4 className="font-semibold text-foreground">
                  פנו לעו״ד עידן יהודה
                </h4>
                <p className="text-sm text-foreground/70">
                  התכתבו עם משרד הרצוג בנוגע לבחירת המנהלת
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                2
              </div>
              <div>
                <h4 className="font-semibold text-foreground">
                  בחרו בנציגות מודעת
                </h4>
                <p className="text-sm text-foreground/70">
                  דיונו את הבחירה עם נציגי הדיירים הנבחרים
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                3
              </div>
              <div>
                <h4 className="font-semibold text-foreground">
                  פתחו חוזה ודינו תנאים
                </h4>
                <p className="text-sm text-foreground/70">
                  בחרו עוד כללי העסקה וניהול הפרויקט
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Final Message */}
        <div className="text-center pt-4 border-t border-primary/10">
          <div className="inline-flex items-center gap-2 text-primary font-semibold">
            <span>מחכים לשמוע ממכם</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </PresentationContainer>
  );
};
