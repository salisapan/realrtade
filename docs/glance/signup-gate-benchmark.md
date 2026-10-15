# Signup gate benchmark

Fetched 2026-10-15. Each row is what the public page returned that day. A blank form means the HTML did not contain the fields. Nothing here is filled in from memory.

## Grammarly

- Pages: [grammarly.com](https://www.grammarly.com/) and [grammarly.com/signup](https://www.grammarly.com/signup) (HTTP 200, title “Sign Up – Create a Free Account | Grammarly”).
- Fields in the signup HTML: required email (`name="email"`), required password (`name="password"`, visible line “Use 8 characters or more”), required name (`name="name"`). Also “Continue with Google” and “Continue with Apple”.
- Consent wording, visible text: “By continuing, you agree to the Superhuman ToS and Privacy Policy.” Then: “You also agree to receive product-related marketing emails from Grammarly, which you can unsubscribe from at any time.” Marketing is bundled into continuing. The HTML also carries checkbox class names; the visible sentence is not a separate unchecked box.
- After signup: not observed. The page stops at the form.
- Tone: “Think big. We’ll take care of the details.” Homepage also says “We do not sell or monetize user content.”
- Glance difference: email only, no password, terms are a required checkbox, the list is a separate box that starts unchecked, and a real confirm email sets the list.

## Superhuman

- Pages: [superhuman.com](https://superhuman.com/) (HTTP 200) and [superhuman.com/signup](https://superhuman.com/signup), which 301s to [superhuman.com/mail/signup](https://superhuman.com/mail/signup).
- The mail signup document is a Next.js shell. Title: “Superhuman Mail | Sign Up”. `pageProps` is `{}`. No email, password, or checkbox is in the HTML. The form is not recorded here.
- Homepage call to action is “Get Superhuman”. The page describes mail, docs, and an assistant that works across apps. It does not show a download step in the fetched text.
- Glance difference: the gate is a document with the fields in the HTML, and the next step is the Chrome Web Store only after consent is accepted.

## Arc

- Pages: [arc.net](https://arc.net/) and [arc.net/download](https://arc.net/download) (HTTP 200, title “Download Arc”).
- Download page visible text: “Download Arc for Windows”, “Download Arc for Mac”, “Download iOS / Get it in the App Store”. No email field and no consent checkbox in that text.
- Homepage privacy line: “We don’t know what sites you visit or what you search for.”
- Post-download step: the buttons themselves. No account step was in the fetched download page.
- Glance difference: Glance does not hand out a file. Chrome installs from the store, and the store opens only after the terms checkbox and a valid email.

## What Glance keeps from this

Grammarly’s bundled marketing sentence is the pattern to avoid: the list stays optional and off until a second click. Arc’s direct download is the pattern the store link follows, with the consent step in front of it because Glance records an email. Superhuman’s signup form was not in the fetched HTML, so it does not set a field list for this gate.
