# Marketing confirm

Sent only when `marketing_opt_in` is true. The list turns on when the person opens `{{confirm_url}}`, which sets `marketing_confirmed_at`. The terms row is already stored and does not depend on this click.

HTML source: `docs/glance/emails/marketing-confirm.html`.

## English

- Subject: Confirm Glance product updates
- Preheader: One click adds you to the list. The signup itself is already done.
- Body: You asked for product updates and tips on the Glance page. Confirm to join the list.
- Button: Confirm the list → `{{confirm_url}}`
- Footer: You received this because you checked the optional updates box on the Glance signup. The signup itself does not depend on this click. Unsubscribe: `{{unsubscribe_url}}`.

## Hebrew

- Subject: אשרו עדכונים על Glance
- Preheader: לחיצה אחת מוסיפה אתכם לרשימה. ההרשמה עצמה כבר נשמרה.
- Body: ביקשתם עדכונים וטיפים על המוצר בעמוד Glance. אשרו כדי להצטרף לרשימה.
- Button: אישור הרשימה → `{{confirm_url}}`
- Footer: קיבלתם את זה כי סימנתם את תיבת העדכונים האופציונלית בהרשמה ל-Glance. ההרשמה עצמה לא תלויה בלחיצה הזו. הסרה: `{{unsubscribe_url}}`.

Brand names in the Hebrew HTML are wrapped in `<bdi>`. The message does not claim a send happened, and it does not describe Glance as an email product.
