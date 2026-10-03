# Teacher batch 2 (English): promises, statements, acknowledgements, and many hard negatives. Same domains as en-train-3.
D = []
def g(act, action, *s): D.append((act, action, list(s)))

g('PROMISE','pay',
 "I'll settle the bill tonight, sorry for the delay.",
 "We will pay the supplier on Friday as agreed.",
 "The pledge will be wired from our account this afternoon.",
 "I'll cover the studio rental, no problem.")
g('PROMISE','sign',
 "I'll countersign the SLA and send it today.",
 "We'll sign the term sheet once legal is done.",
 "I will e-sign the authorization this evening.")
g('PROMISE','approve',
 "I'll approve the creative once I see the final colours.",
 "We'll give you the green light on Monday morning.",
 "I will authorize the refund today.")
g('PROMISE','confirm',
 "I'll confirm my new number by email.",
 "We'll double check the tax ID and let you know.",
 "I will verify the guest's name before the recording.")
g('PROMISE','schedule',
 "I'll book the onboarding session this week.",
 "We will set up the call with our CFO.",
 "I'll arrange the photographer for ten o'clock.",
 "Let me find a slot for the fitting and message you.")
g('PROMISE','decide',
 "We'll pick a logo direction by Thursday.",
 "I'll decide about the premium plan after the trial.",
 "We will let you know about the Arabic translation on Monday.")
g('PROMISE','review',
 "I'll go through the translation tonight and flag anything odd.",
 "We'll review the media plan tomorrow morning.",
 "Let me take a look at the mood board over the weekend.")
g('PROMISE','join',
 "I'll join the investor call at 10.",
 "We will attend the training on Wednesday.",
 "I'll be at the premiere on Friday.")
g('PROMISE','complete',
 "I'll finish the subtitles by Wednesday.",
 "We will prepare the investor update before month end.",
 "I'll sort out the SSO setup this week.",
 "I will draft the campaign brief tomorrow.")
g('PROMISE','send',
 "I'll send the raw files via WeTransfer in an hour.",
 "We will share the style guide today.",
 "I'll email last year's return tonight.",
 "Will pull the usage report and send it over.",
 "I'll forward the contract to legal and copy you.",
 "You'll get the high-res logo by end of day.")
g('PROMISE','reply',
 "I'll come back to you on the proposal by Thursday.",
 "We will look into the double charge and let you know.",
 "I'll find out the ETA and tell you.",
 "Our support team will get back to you within 24 hours.",
 "I'll check the cancellation policy and reply.",
 "I will update you on the campaign results next week.")

g('INFORM','none',
 "Your June bill was issued on the 3rd and is due on the 24th.",
 "The studio is booked on Saturday from 10 to 6.",
 "The pledge campaign has reached 80% of its goal.",
 "The annual plan renews automatically every March.",
 "We sent the invoice to the address on file.",
 "The final cut runs for 94 minutes.",
 "Interest on the loan is fixed for five years.",
 "The photographer is based in Lisbon and shoots on film.",
 "Our translators work Sunday to Thursday.",
 "The sofa takes eight weeks to arrive.",
 "The tax deadline for individuals is April 15.",
 "Episode 4 was published on Tuesday.",
 "Your dog's appointment is on Thursday at 11.",
 "The gym is closed on public holidays.",
 "Support hours are 9 to 5, Monday to Friday.",
 "The new release adds single sign-on and fixes two bugs.",
 "Revenue from the campaign was lower than forecast.",
 "She sent the model release yesterday.",
 "The agency has already approved the budget.",
 "I'm sorry to hear that, that must have been stressful.",
 "Please be advised that the office will relocate next month.",
 "As requested, the report is attached.",
 "We regret to inform you that the offer has expired.",
 "I did not receive your payment yet.",
 "He will probably call you tomorrow, he said.",
 "You will find the details in the attached document.",
 "Our records indicate that the account was last accessed in May.",
 "The fee is non-refundable after 14 days.",
 "Let me be clear, this is not what we agreed.",
 "The meeting has been moved to Thursday.",
 "I have a headache today so I'll be slow.",
 "Could be a bug, could be user error, hard to say.",
 "Everything is on track for the launch.",
 "We might need more time, depends on legal.")

g('ACK','none',
 "Thanks, that clears it up.",
 "Great, thank you for the quick fix.",
 "Awesome work on the episode!",
 "Thanks a lot for fitting me in.",
 "Perfect, that works for me.",
 "Understood, thank you.",
 "Congratulations on closing the round!",
 "Thank you for choosing us, we appreciate your business.",
 "Cheers, speak soon.",
 "Good to hear, thanks for letting me know.",
 "Best of luck with the launch!",
 "Love the new design, well done.",
 "Thanks for the warm welcome.",
 "No rush at all, whenever you can.",
 "Have a wonderful weekend.",
 "Thanks again, have a great evening.",
 "Merry Christmas and a happy new year!",
 "Happy to help anytime.",
 "Hope the move went smoothly.",
 "Thanks, noted.",
 "Sounds like a plan.",
 "All good here, thanks for asking.")

if __name__ == '__main__':
    import json, sys
    out = []
    for act, action, ss in D:
        for t in ss:
            out.append({'t': t, 'act': act, 'action': action, 'lang': 'en', 'src': 'teacher'})
    json.dump(out, sys.stdout, ensure_ascii=False, indent=0)
