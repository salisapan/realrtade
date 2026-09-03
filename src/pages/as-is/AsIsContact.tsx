import { FormEvent, useState } from "react";
import AsIsLayout from "@/components/as-is/AsIsLayout";
import { BeamCard, PageHero, Section } from "@/components/as-is/AsIsUI";
import { useAsIsSeo } from "@/components/as-is/useAsIsSeo";
import { trackAsIsEvent } from "@/components/as-is/useAsIsAnalytics";
import { supabase } from "@/integrations/supabase/client";
import { company, contactSteps } from "@/data/as-is-content";

export default function AsIsContact() {
  useAsIsSeo({
    title: "צור קשר",
    description: "מזהים הזדמנות בבניין שלכם? קבעו פגישת היכרות עם AS-IS GROUP לבדיקת התכנות ראשונית ללא עלות וללא התחייבות.",
    path: "/as-is/contact",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", message: "" });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    // "as_is_leads" isn't in the generated Database type yet — it needs
    // `supabase gen types` re-run against the project after the migration in
    // supabase/migrations/20260901000000_create_as_is_leads.sql is applied.
    const { error: insertError } = await supabase.from("as_is_leads" as never).insert({
      name: form.name,
      phone: form.phone,
      email: form.email || null,
      city: form.city || null,
      message: form.message || null,
    } as never);
    setSubmitting(false);
    if (insertError) {
      setError("קרתה תקלה בשליחה, נסו שוב או צרו קשר ישירות באימייל.");
      trackAsIsEvent("contact_form_error");
      return;
    }
    trackAsIsEvent("contact_form_submit");
    setSubmitted(true);
  }

  return (
    <AsIsLayout>
      <PageHero
        eyebrow="הצעד הבא"
        title="מזהים הזדמנות בבניין שלכם?"
        subtitle="אנו רוצים לפגוש אתכם, בעלי הדירות, ולבחון יחד את ההתכנות למיצוי מלוא זכויותיכם — ללא התחייבות"
      />

      <Section>
        <BeamCard style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
            {contactSteps.map((s, i) => (
              <div key={s.t} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div
                  className="asis-mono"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg,var(--accent),var(--accent-2))",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <div>
                  <p style={{ margin: "0 0 3px", fontSize: 14.5, fontWeight: 700, color: "var(--txt-hi)" }}>{s.t}</p>
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </BeamCard>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }} className="asis-contact-grid">
          <div className="asis-glass" style={{ padding: "28px 26px" }}>
            {submitted ? (
              <div style={{ textAlign: "center", padding: "30px 10px" }}>
                <svg viewBox="0 0 24 24" width="44" height="44" stroke="var(--accent-2)" fill="none" style={{ margin: "0 auto 14px" }}>
                  <path d="M5 13l4 4L19 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <h3 style={{ fontSize: 19, margin: "0 0 6px" }}>תודה!</h3>
                <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>קיבלנו את הפרטים ונחזור אליכם בהקדם</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
                <Field label="שם מלא" name="name" value={form.name} onChange={handleChange} required />
                <Field label="טלפון" name="phone" value={form.phone} onChange={handleChange} required type="tel" />
                <Field label="אימייל" name="email" value={form.email} onChange={handleChange} type="email" />
                <Field label="עיר / כתובת הבניין" name="city" value={form.city} onChange={handleChange} />
                <div>
                  <label style={labelStyle}>הודעה</label>
                  <textarea
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    rows={4}
                    style={{ ...inputStyle, resize: "vertical" as const }}
                  />
                </div>
                {error && (
                  <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--warm)" }}>
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  className="asis-btn"
                  disabled={submitting}
                  style={{ justifyContent: "center", marginTop: 6, opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? "שולח..." : "שליחת הפנייה"}
                </button>
                <p style={{ margin: 0, fontSize: 11, color: "var(--muted)", lineHeight: 1.5, textAlign: "center" }}>
                  הפרטים נשמרים אצלנו ומשמשים אך ורק ליצירת קשר בנוגע לפנייתכם, ולא יועברו לצד שלישי.
                </p>
              </form>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="asis-card">
              <h4 style={{ fontSize: 15, margin: "0 0 6px" }}>אימייל</h4>
              <a
                href={`mailto:${company.email}`}
                onClick={() => trackAsIsEvent("email_click")}
                className="asis-mono"
                style={{ fontSize: 14, color: "var(--accent-2)", textDecoration: "none" }}
              >
                {company.email}
              </a>
            </div>
            <div className="asis-card">
              <h4 style={{ fontSize: 15, margin: "0 0 6px" }}>אתר</h4>
              <a
                href={`https://${company.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="asis-mono"
                style={{ fontSize: 14, color: "var(--accent-2)", textDecoration: "none" }}
              >
                {company.website}
              </a>
            </div>
            <div className="asis-card">
              <h4 style={{ fontSize: 15, margin: "0 0 6px" }}>זמינות</h4>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>פנויים לפרויקטים חדשים</p>
            </div>
          </div>
        </div>
      </Section>

      <style>{`
        @media (max-width: 760px) {
          .asis-contact-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AsIsLayout>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12.5,
  color: "var(--muted)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid var(--line-hi)",
  background: "var(--panel)",
  color: "var(--txt)",
  fontSize: 14,
  fontFamily: "var(--body)",
};

function Field({
  label,
  name,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: "var(--warm)" }}>*</span>}
      </label>
      <input type={type} name={name} value={value} onChange={onChange} required={required} style={inputStyle} />
    </div>
  );
}
