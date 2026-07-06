// Sends a welcome email when a new row lands in public.waitlist.
// Triggered by a Supabase Database Webhook (table: waitlist, event: INSERT).
// Requires the RESEND_API_KEY secret (see README.md in this folder for setup).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const WEBHOOK_SECRET = Deno.env.get("WAITLIST_WEBHOOK_SECRET"); // optional, recommended

// TODO: replace with your Resend-verified sending address once you've added a domain.
const FROM_ADDRESS = "Flow <hello@yourdomain.com>";

const COPY: Record<string, { subject: string; text: string }> = {
  en: {
    subject: "You're on the Flow waitlist",
    text: [
      "Hi,",
      "",
      "You're in. We've added your email to the Flow early access waitlist.",
      "",
      "Flow is a local-first execution engine — it watches your work on-device, detects the moment a task needs doing, and gets it done with one click. No cloud processing. No API keys. No new dashboard to learn.",
      "",
      "We're onboarding pilot teams in small batches, starting with legal, finance, and healthcare. We'll reach out personally as your spot opens up.",
      "",
      "In the meantime, reply to this email any time — a real person reads it.",
      "",
      "— The Flow team",
    ].join("\n"),
  },
  he: {
    subject: "אתם ברשימת ההמתנה של Flow",
    text: [
      "היי,",
      "",
      "זהו זה — הוספנו את כתובת המייל שלכם לרשימת ההמתנה לגישה מוקדמת ל-Flow.",
      "",
      "Flow הוא מנוע ביצוע Local-First — הוא צופה בעבודה שלכם על המכשיר, מזהה את הרגע שבו משימה דורשת טיפול, ומבצע אותה בקליק אחד. בלי עיבוד בענן. בלי מפתחות API. בלי דשבורד חדש ללמוד.",
      "",
      "אנחנו קולטים צוותי פיילוט בקבוצות קטנות, החל מתחומי המשפטים, הפיננסים והבריאות. ניצור איתכם קשר אישית כשיתפנה מקום.",
      "",
      "בינתיים, אפשר להשיב למייל הזה בכל עת — אדם אמיתי קורא אותו.",
      "",
      "— צוות Flow",
    ].join("\n"),
  },
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (WEBHOOK_SECRET) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return new Response("Server not configured", { status: 500 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const record = payload?.record;
  const email: string | undefined = record?.email;
  const lang: string = record?.lang === "he" ? "he" : "en";

  if (!email) {
    return new Response("Missing email in payload", { status: 400 });
  }

  const { subject, text } = COPY[lang];

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [email],
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Resend API error:", res.status, body);
      return new Response("Failed to send email", { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error sending welcome email:", err);
    return new Response("Internal error", { status: 500 });
  }
});
