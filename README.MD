BUNQ Monthly Bills for Google Sheets

**work in progress, please contribute**

Start managing your (shared) BUNQ account by keeping track of your (household) expenses and budgeting accordingly in Google Sheets. The BUNQ app has some nice expense tracking and budgeting features but nothing beats the old spreadsheet for the overview. And with your own script you can take charge of how you would like to budget.

This script sorts your subscriptions (classifies them) and monthly payments to the same accounts such as the supermarket.It then budgets money that is needed to come in to the account based on outgoing payments of the previous months.

Currently it is focused on subscriptions because I have been using it for an account that I do not use for supermarket payments but only for shared (household service provider) subscriptions. Predicting other categorical expenses such as groceries is also a feature of the BUNQ app.

Use of the script.

0. Create an installation for the BUNQ API in order to retrieve your API secrets and authentication. 
    0.1 Login to the developer portal
    0.2. Create an app called “monthly bills” or something similar so you will recognize it.
    0.3. Pass your public key and receive the one from BUNQ. (I suggest in Postman) POST /v1/installation 
    0.4. Register your device and IP address. POST /v1/device-server
Enter your details in the API tab next to the required variables. The script will take care of opening new sessions.
    0.5. List monetary accounts and choose which one to use with the sheet.

1. Initialize
First initialize the sheet; it will get all payments from the current year until now and look at the past 3 months to see which payments constitute subscriptions. You can then manually drag any accounts to the subscriptions tab if they did not get correctly classified.

2. Predict
Assuming you initialize this halfway through the month; You can then use the prediction function estimate what this months subscriptions will amount to based on last month. Again, manually adjust if necesarry in case you expect deduction amounts to change.

3. Account
On the first of the new month (this is to be done automatically in future versions) check the subscriptions that were paid and write all past month's payments to the sheet. You can now review if there were any unexpected payments or amounts that were different.

4. Predict and advance payments
Also on the first of the month, use the prediction function for this month's payments. Any amounts that you "hardcode" manually into the sheet will be used instead of the predicted amounts for the expected sum. For example mortgage or loan payments can vary by slight amounts each month and could be retrieved from another accounting sheet.

If you don't advance payments on the first of the month, but also in the case that service providers might charge extra, there is a cell in the API tab where you can set a buffer amount. The prediction function will aim to keep that buffer on the account.

The prediction function and advance payments function are not fully done yet.

Here is the sheet: https://docs.google.com/spreadsheets/d/1i6wpanfpkcFVet6_C1Bzr2VoB6edMzNaofxRNpIurwo/edit?usp=sharing

Installing clasp for development recommended.
https://medium.com/geekculture/how-to-write-google-apps-script-code-locally-in-vs-code-and-deploy-it-with-clasp-9a4273e2d018