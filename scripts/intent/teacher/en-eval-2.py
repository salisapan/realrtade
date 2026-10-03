# Second held-out evaluation set (English), written BEFORE the second training batch and run once for a
# first-contact number. Deliberately different STYLE from the first batches: non-native English, run-ons,
# ALL CAPS, WhatsApp-style, forwarded text, abbreviations, emoji. Domains not in any training batch:
# academia, government services, retail floor operations, manufacturing, restaurants, farming, sports clubs,
# crypto start-ups, immigration paperwork, car repair.
D = []
def g(act, action, *s): D.append((act, action, list(s)))

g('ASK','pay',
 "pls transfer registration fee for the tournament before sunday thx",
 "Kindly to remit the balance for the spare parts as soon as possible.",
 "WE STILL DID NOT RECEIVE THE PAYMENT FOR THE ORDER, PLEASE ADVISE",
 "can you pay me back for the pizza? 15 euro",
 "The grant office needs the overhead invoice paid within the month, could you action that?",
 "pay the parking ticket by friday or theres a fine")
g('ASK','sign',
 "need ur signature on the lease renewal, can u pop in tomorrow?",
 "Please to sign the form and bring it to the counter with your ID.",
 "ALL PARTNERS MUST SIGN THE CONSENT BEFORE THE FILING",
 "could you sign off the timesheets for my team. they r pending since monday")
g('ASK','approve',
 "can u approve my leave request? its been pending 4 days",
 "I am waiting for your authorization for the welding job, can you give OK?",
 "the committee needs your yes on the thesis topic before the semester starts",
 "Would the manager approve the discount for the bulk order?")
g('ASK','confirm',
 "pls confirm u r coming to practice tmrw",
 "Can you confirm that the shipment is for the Haifa branch and not Tel Aviv?",
 "Please to confirm the appointment time for the visa interview.",
 "kindly verify your wallet address before we send the tokens",
 "are the measurements 120 by 80 or 80 by 120? need to be sure before cutting")
g('ASK','schedule',
 "when can u come for the oil change? i have slot thursday morning",
 "lets do a call, which day is ok for you this week??",
 "Please schedule your biometrics appointment through the portal.",
 "Can we reschedule the viva to the following week? my supervisor is travelling",
 "need a table for 8 on saturday night, do u have anything at 8?")
g('ASK','decide',
 "which engine option do u want, the 2.0 or the hybrid?",
 "Do you accept the terms or you want to negotiate? we need decision today.",
 "Choose the dessert option for the wedding menu please",
 "should we go ahead with the supplier from turkey or stay with the old one?")
g('ASK','review',
 "can you look at my abstract before i submit? deadline is tonight",
 "Please check the invoice and tell if the VAT is correct",
 "Could you take a quick look at the smart contract, i think theres a bug in the withdraw function",
 "need ur feedback on the menu design asap",
 "read this and tell me what u think")
g('ASK','join',
 "are you joining the training on tuesday? coach is asking",
 "Please come to the farmers meeting at the community hall, 7 pm.",
 "everyone should attend the safety briefing at 6am",
 "can you be at the airport at 5 to pick up the delegation?")
g('ASK','complete',
 "please fill the supplier form and the bank form and send both",
 "Can you finish the repair by Thursday? the customer is calling every day",
 "You need to complete step 3 of the application before we can process it.",
 "pls update the roster for the weekend shift",
 "write the recommendation letter for the scholarship and upload it, thank you in advance")
g('ASK','send',
 "send me the pics of the damage pls",
 "Could you kindly send copy of your passport and the previous visa?",
 "pls share the wallet logs with the auditors",
 "forward me the email from the supplier",
 "can you give me the harvest numbers for last week?",
 "please attach the delivery note to the invoice")
g('ASK','reply',
 "hello? did u see my message??",
 "any update about my application? it is 3 months now",
 "WHERE IS MY CAR? you said it will be ready yesterday",
 "has the visa been issued? we are worried",
 "do u know if the field is free on sunday?",
 "Can you let me know the status of the refund?",
 "what is going on with the shipment, nobody answers the phone",
 "hi, just following up on the quote i sent last week. thoughts?",
 "wen is the next bus to the stadium?")

g('PROMISE','pay',
 "will send the money tomorrow, sorry for delay",
 "we will transfer the payment on monday morning, inshallah",
 "I pay you back on friday for sure")
g('PROMISE','sign',
 "i will sign and bring it tomorrow",
 "we will have all partners sign by the end of the week")
g('PROMISE','approve',
 "I approve it today, just waiting for my boss to be back",
 "will give you the ok by tonight")
g('PROMISE','confirm',
 "i confirm with the branch and let u know",
 "I will verify the wallet and come back to you in few hours")
g('PROMISE','schedule',
 "i book you for thursday at 9, see you then",
 "we will arrange the viva for next week and send the invitation")
g('PROMISE','decide',
 "we decide about the supplier on monday and tell you",
 "I will choose the dessert tonight")
g('PROMISE','review',
 "i will look at the abstract tonight, dont worry",
 "I check the contract this evening and send my notes")
g('PROMISE','join',
 "i will be at practice, count me in",
 "we will come to the meeting at the hall")
g('PROMISE','complete',
 "the repair will be finished by thursday, i promise",
 "i will update the roster tomorrow morning",
 "I write the letter this weekend and upload it")
g('PROMISE','send',
 "sending the pics now",
 "I will send copy of passport tomorrow, now i am at work",
 "will forward the email in 5 min",
 "we send you the harvest numbers on friday")
g('PROMISE','reply',
 "i will get back to you asap",
 "we will inform you about the application result",
 "will let you know about the field tomorrow",
 "I check and I tell you")

g('INFORM','none',
 "The tournament starts at 9 and the final is at 4.",
 "My brother paid the fee already last week.",
 "Your visa application is currently under review.",
 "The part is out of stock until next month, supplier said.",
 "CLOSED FOR HOLIDAY UNTIL 5 OCT",
 "The harvest was good this year thanks to the rain.",
 "The viva lasted about two hours, they asked about chapter 3.",
 "Please note that we do not accept cash.",
 "Transaction 0x4f2a was confirmed in block 18221.",
 "The car needs new brake pads and the labour is 200.",
 "The committee meets every second Tuesday.",
 "Weather forecast says rain on saturday so match is maybe cancelled.",
 "Forwarded message: From: Supplier. Subject: delay in delivery.",
 "The recipe uses two cups of flour and one egg.",
 "I was thinking we could maybe try a different approach.",
 "He said he will call you but I am not sure when.",
 "The form is available at the front desk.",
 "We have 14 staff on the floor today.",
 "Sorry, I cannot make it on Tuesday.",
 "I already sent the documents on Monday, check your spam folder.",
 "The professor is on sabbatical until January.",
 "FYI, rates went up again this week.")

g('ACK','none',
 "thx a lot!!!",
 "ok cool 👍",
 "Thank you very much for your kind help.",
 "no problem bro",
 "Best wishes for the new season!",
 "got it, thanks for the info",
 "congrats on the baby 🎉",
 "Have a blessed day",
 "Happy birthday!",
 "lol ok",
 "Thanks, see you at the game.",
 "You are welcome.",
 "Great job team!",
 "Appreciate it man",
 "good luck with the exams!")

if __name__ == '__main__':
    import json, sys
    out = []
    for act, action, ss in D:
        for t in ss:
            out.append({'t': t, 'act': act, 'action': action, 'lang': 'en', 'src': 'teacher-eval-2'})
    json.dump(out, sys.stdout, ensure_ascii=False, indent=0)
