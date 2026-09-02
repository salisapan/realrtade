// Notifies the AS-IS team by email the moment a new lead lands in
// public.as_is_leads, so a visitor who fills out the contact form gets
// followed up with instead of sitting silently in a database.
// Triggered by a Supabase Database Webhook (table: as_is_leads, event: INSERT).
// Requires the RESEND_API_KEY secret (see README.md in this folder for setup).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const WEBHOOK_SECRET = Deno.env.get("AS_IS_LEADS_WEBHOOK_SECRET"); // optional, recommended

// TODO: replace with a Resend-verified sending address once a domain is added.
const FROM_ADDRESS = "AS-IS GROUP Website <leads@as-isgroup.com>";
// TODO: confirm this is the right inbox for new leads before going live.
const TO_ADDRESS = "info@as-isgroup.com";

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
  const name: string | undefined = record?.name;
  const phone: string | undefined = record?.phone;
  if (!name || !phone) {
    return new Response("Missing name/phone in payload", { status: 400 });
  }

  const email: string = record?.email || "לא צוין";
  const city: string = record?.city || "לא צוין";
  const message: string = record?.message || "—";

  const text = [
    "פנייה חדשה מהאתר של AS-IS GROUP",
    "",
    `שם: ${name}`,
    `טלפון: ${phone}`,
    `אימייל: ${email}`,
    `עיר / כתובת: ${city}`,
    `הודעה: ${message}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [TO_ADDRESS],
        reply_to: email !== "לא צוין" ? email : undefined,
        subject: `פנייה חדשה: ${name}`,
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
    console.error("Unexpected error sending lead notification:", err);
    return new Response("Internal error", { status: 500 });
  }
});
