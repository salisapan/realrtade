# Teacher-authored HELD-OUT evaluation sentences (English). Domains NOT present in the training batches:
# healthcare administration, schools, logistics and shipping, IT support, events and non-profits.
# Never used to learn weights. Honest caveat: written by the same teacher as the training data.
D = []
def g(act, action, *s): D.append((act, action, list(s)))

g('ASK','pay',
 "Please settle the copay before your next appointment.",
 "The tuition for term two is due on the 5th, can you transfer it?",
 "Could you pay the customs duty so the container can be released?",
 "We still need the sponsorship fee to print your logo on the banner.",
 "Is the licence renewal fee going to be paid this month? It expires Friday.")
g('ASK','sign',
 "Could you sign the consent form before the procedure?",
 "Please have a parent sign the permission slip and send it back.",
 "The carrier needs a signed delivery note, can you sign and return it?",
 "Please sign the acceptable use policy so IT can activate your account.",
 "Would you sign the volunteer waiver at the front desk?")
g('ASK','approve',
 "Can you approve the pre-authorization request for the MRI?",
 "Please approve my access request to the finance folder.",
 "We need your sign-off on the shipping manifest before it leaves the dock.",
 "Can the principal approve the field trip budget by Wednesday?",
 "Would the committee approve the grant application this round?")
g('ASK','confirm',
 "Please confirm your date of birth so we can pull up your file.",
 "Can you confirm the pallet count? The driver says there are 14, not 16.",
 "Could you verify that the lab sent the results to the right clinic?",
 "Please confirm your VPN token works after the reset.",
 "Can you confirm how many volunteers are coming Saturday?")
g('ASK','schedule',
 "Can we book a follow-up with Dr. Cohen for next week?",
 "Please schedule the parent-teacher conference using the link.",
 "When can the truck come back to collect the returns?",
 "Can IT visit your desk tomorrow morning to swap the laptop?",
 "Let's find a date for the fundraiser dinner, what works for the board?")
g('ASK','decide',
 "Do you want the generic or the brand-name prescription?",
 "Which elective would you like to take next semester?",
 "Should we ship by air or by sea? The price difference is large.",
 "Do you want to keep the old licence or upgrade to the team plan?",
 "Pick a venue: the hall downtown or the garden pavilion.")
g('ASK','review',
 "Could you review the discharge summary for errors?",
 "Please look over the report card comments before they go out.",
 "Can you check the customs declaration for mistakes?",
 "Would you test the fix and tell me if the printer works now?",
 "Please read the draft grant narrative and flag anything unclear.")
g('ASK','join',
 "Can you attend the staff meeting at 8 on Monday?",
 "Please register your child for the science fair by Friday.",
 "Will you join us for the volunteer orientation?",
 "Can you dial in to the incident call? We need someone from networking.",
 "Please come to the front office to collect the form.")
g('ASK','complete',
 "Please complete the intake questionnaire before your visit.",
 "Can you fill in the incident report for the ER?",
 "Could you finish the inventory count by closing time?",
 "We need the ticket updated with the steps you tried.",
 "Please prepare the thank-you letters for the donors.")
g('ASK','send',
 "Could you send us your insurance card, front and back?",
 "Please email the vaccination records to the school office.",
 "Can you forward the bill of lading to the broker?",
 "Please send a screenshot of the error.",
 "Can you share the guest list with the caterer?",
 "I need the serial number of the laptop, could you find it and send it?")
g('ASK','reply',
 "Any news on the biopsy results?",
 "Has the container cleared customs yet?",
 "What is the status of my ticket? It has been open for a week.",
 "Could you let me know whether my daughter's application was received?",
 "Do you know when the venue will confirm our booking?",
 "Why was my claim denied? Please explain.",
 "Can you tell me if the sponsors have replied?",
 "Is the server back up? Nothing loads on my side.",
 "Where is my parcel? It said delivered but I never got it.",
 "Please get back to me regarding the open position.")

g('PROMISE','pay',
 "I'll pay the copay at the desk tomorrow.",
 "We will transfer the tuition on the 4th.",
 "The duty will be paid by our broker today.")
g('PROMISE','sign',
 "I'll sign the consent form when I arrive.",
 "My wife will sign the permission slip tonight and I'll send it back.",
 "We'll sign for the delivery on arrival.")
g('PROMISE','approve',
 "I'll approve your access request in the next hour.",
 "The principal said she'll approve the trip budget on Wednesday and I'll let you know.")
g('PROMISE','confirm',
 "I'll confirm the pallet count with the driver.",
 "I will verify with the lab and tell you.",
 "We'll confirm the volunteer headcount on Thursday.")
g('PROMISE','schedule',
 "I'll book the follow-up and call you with the time.",
 "I'll set up IT's visit for tomorrow morning.",
 "We'll fix a date for the dinner once the board replies.")
g('PROMISE','decide',
 "We'll decide on the venue after the site visit.",
 "I'll choose my electives by Friday.")
g('PROMISE','review',
 "I'll go through the discharge summary this afternoon.",
 "I will test the fix and report back.",
 "We'll look at the grant narrative on Monday.")
g('PROMISE','join',
 "I'll be at the staff meeting.",
 "We'll register for the science fair tonight.",
 "I'll dial in to the incident call.")
g('PROMISE','complete',
 "I'll fill in the intake form tonight.",
 "We'll finish the count before closing.",
 "I'll update the ticket right away.",
 "I will write the thank-you letters this week.")
g('PROMISE','send',
 "I'll send my insurance card when I get home.",
 "We will email the vaccination records tomorrow.",
 "I'll forward the bill of lading in a minute.",
 "Screenshot coming right up.",
 "I can send the guest list by tonight.")
g('PROMISE','reply',
 "I'll call you as soon as the results are in.",
 "We'll let you know once customs clears it.",
 "I'll look into your ticket and get back to you today.",
 "Our admissions team will contact you within a week.",
 "I'll chase the venue and update you.")

g('INFORM','none',
 "Your appointment is on Tuesday at 10:15 with Dr. Cohen.",
 "The clinic is closed on public holidays.",
 "Lab results usually take three to five business days.",
 "The school bus leaves at 7:40 from the corner of Elm Street.",
 "Report cards go home on the 20th.",
 "The container arrived at the port on Monday.",
 "Customs clearance can take up to 48 hours.",
 "The warehouse is open from 6 to 4.",
 "Your ticket number is 88231.",
 "The outage was caused by a failed switch.",
 "The password policy changed last month.",
 "The gala raised over $40,000 last year.",
 "Volunteers received a free t-shirt.",
 "Doors open at 6:30 and the show starts at 7.",
 "I'm on leave until the 3rd.",
 "He was admitted on Friday and discharged on Sunday.",
 "Your claim was denied because the policy had lapsed.",
 "The printer on the second floor has been replaced.",
 "Please note the front gate closes at 5 pm.",
 "Attached is the schedule for the week.",
 "The package was marked delivered at 2:14 pm.",
 "Our sponsors this year include three local banks.",
 "I will not be available this Thursday.",
 "The doctor said the results look normal.",
 "Fundraising is behind target by about ten percent.")

g('ACK','none',
 "Thank you, doctor, I feel much better.",
 "Great, we'll see you Tuesday!",
 "Thanks for the update, much appreciated.",
 "Got it.",
 "Good morning everyone!",
 "Wishing you a speedy recovery.",
 "Congratulations on the award!",
 "Thank you for volunteering, it meant a lot.",
 "Happy holidays from all of us.",
 "Sounds great, thanks.",
 "Thanks for your help with the shipment.",
 "No problem at all!",
 "Safe journey!",
 "Great event last night!",
 "Thanks, will do.",
 "Hope the kids enjoyed the trip.",
 "Take care.",
 "That's wonderful news.")

if __name__ == '__main__':
    import json, sys
    out = []
    for act, action, ss in D:
        for t in ss:
            out.append({'t': t, 'act': act, 'action': action, 'lang': 'en', 'src': 'teacher-eval'})
    json.dump(out, sys.stdout, ensure_ascii=False, indent=0)
