# Teacher batch 2 (English), ASK-heavy. Domains disjoint from BOTH held-out sets: telecom, retail banking,
# SaaS customer success, advertising agency, photography and film, interior design, translation and
# localization, gyms, crowdfunding and investor relations, podcasts and media, pet services, tax-season accounting.
D = []
def g(act, action, *s): D.append((act, action, list(s)))

g('ASK','pay',
 "Your June bill is overdue, please pay it before we suspend the line.",
 "Could you cover the studio rental for Saturday? It's 300.",
 "pls settle the outstanding fee for the translation, it's been 45 days",
 "Can you wire the pledge by the end of the campaign? The platform closes at midnight.",
 "We need the retainer for the tax filing before we can start.",
 "Would you mind paying the vet bill by Friday, the clinic is chasing us.",
 "monthly membership failed again, can you update the card or pay at the desk?",
 "Please clear the invoice for the ad spend, the agency is holding the campaign.",
 "I still need the 50% deposit for the shoot, can you send it today?",
 "Are you going to pay the supplier this week? They keep emailing me.")
g('ASK','sign',
 "Please countersign the SLA and send it back to your account manager.",
 "Could you sign the model release for the photos?",
 "we need your sig on the e-file authorization form before we submit",
 "Can you sign the term sheet so we can start the data room?",
 "Please sign the lease addendum for the new dog.",
 "Would you e-sign the translation agreement tonight?",
 "The bank needs your signature on the loan documents, can you come by?")
g('ASK','approve',
 "Can you approve the creative so we can go live Monday?",
 "Please give the green light on the floor plan, the contractor is waiting.",
 "Do I have your OK to publish the episode?",
 "Could you approve the credit limit increase request?",
 "We need sign-off on the final cut before the festival deadline.",
 "pls approve my expense claim from the conference",
 "Would you authorize the refund for the annual plan?")
g('ASK','confirm',
 "Can you confirm your new phone number for the account?",
 "Please confirm that the invoice address is correct.",
 "Could you verify the spelling of the guest's name before we record?",
 "Can you double check the tax ID on the filing?",
 "Just checking that the swatches arrived, can you confirm?",
 "Please confirm whether the trial users should be migrated.",
 "Can you reconfirm the rate for the Hebrew-to-English batch?")
g('ASK','schedule',
 "Can we set up a call with your CFO about the renewal?",
 "When would you like the photographer to arrive?",
 "Please book your onboarding session using the calendar link.",
 "Could we move the recording to Thursday afternoon?",
 "What times work for a design review next week?",
 "Let's schedule your annual tax meeting, are you free in the second week of March?",
 "Can you come in for a fitting on Tuesday?",
 "Which slot do you want for the dog grooming, 10 or 2?")
g('ASK','decide',
 "Do you want to upgrade to the premium plan or stay on basic?",
 "Which of the three logo directions should we develop further?",
 "Please choose a payout schedule, monthly or at the end of the campaign.",
 "Are you taking the early-bird offer? It expires tonight.",
 "We need to know whether to include the Arabic translation.",
 "Should we pause the campaign until the new landing page is ready?",
 "Which fabric do you prefer for the sofa, linen or velvet?")
g('ASK','review',
 "Could you go through the draft translation and flag awkward phrases?",
 "Please review the media plan and tell me if the budget split looks right.",
 "Can you check the audio levels on the first ten minutes?",
 "Would you read the pitch deck and send me any red flags?",
 "Can someone sanity check the workout program before I send it to the client?",
 "I'd love your honest take on the mood board.",
 "Please look over the K-1 and tell me if anything seems off.")
g('ASK','join',
 "Can you join the investor call tomorrow at 10?",
 "Please attend the product training on Wednesday.",
 "Are you coming to the premiere on Friday? I need a headcount.",
 "Could you sit in on the client workshop?",
 "Please register for the quarterly business review.",
 "We would love for you to speak at the meetup, can you confirm?")
g('ASK','complete',
 "Please fill in the intake form for your pet before the visit.",
 "Can you finish the subtitles for episode 4 by Wednesday?",
 "Could you prepare the investor update for the end of the month?",
 "We need the onboarding checklist completed by your team.",
 "Please sort out the SSO configuration on your side.",
 "Can you draft the campaign brief and share it with the agency?",
 "Would you update the contact info in the portal?",
 "Please build the budget model for the second year.")
g('ASK','send',
 "Can you send the raw files from the shoot?",
 "Please share the style guide with the translators.",
 "Could you email me last year's return so I can prepare this one?",
 "I need the usage report for April, can you pull it?",
 "Please upload your ID and proof of address to the portal.",
 "Can you forward the contract to your legal team and copy me?",
 "Do you have the high-res logo? Could you send it over?",
 "Send me the vaccination record please.",
 "Could you provide the VAT number of your company?")
g('ASK','reply',
 "Any news on the proposal? We'd like to lock in the date.",
 "Have you had a chance to test the new release? Let us know how it went.",
 "Why was I charged twice this month? Please explain.",
 "Just bumping this, can you let me know where things stand?",
 "What's the ETA for the install? The customer is waiting at home.",
 "Hi, did you receive the invoice I sent on Monday?",
 "Do you know if the venue allows drones?",
 "Is the translation going to be ready by Friday?",
 "Can you tell me what the cancellation policy is?",
 "How do I reset my password? The link in the email doesn't work.",
 "Please advise how you want us to proceed.",
 "Is anyone looking at my ticket? It's been three days.",
 "What is the status of the refund?",
 "Where do I send the documents?",
 "Please update me on the campaign results when you can.")

if __name__ == '__main__':
    import json, sys
    out = []
    for act, action, ss in D:
        for t in ss:
            out.append({'t': t, 'act': act, 'action': action, 'lang': 'en', 'src': 'teacher'})
    json.dump(out, sys.stdout, ensure_ascii=False, indent=0)
