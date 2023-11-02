var enableLogging = true;
var enableWrite = false;
var firstTime = false;

var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

var months = list_months();
var thismonth = new Date().getMonth()
var previousmonth = thismonth - 1

function initialize_sheet() {
  // First identifies subscriptions and then writes all the current year's payments to the sheet up to the last complete month

  // Fetch the Bunq data and split it with the classifier
  var data = Classify();
  var subscriptions = data[0];
  var salaries = data[1];
  var other_paid = data[2];
  var other_received = data[3];
  
  // Consecutively find the row and write the subscriptions, salaries, other paid and other received
  // Because the rows change after each insert, we need to find the row again

  // Find the row with "Paid" and "Received"
  var paidRow = findRowByValue(sheet, "Paid");

  // Insert subscriptions below "Paid"
  insertValuesBelowRow(sheet, paidRow, subscriptions);
  
  var receivedRow = findRowByValue(sheet, "Received");

  // Insert salaries below "Received"
  insertValuesBelowRow(sheet, receivedRow, salaries);

  var Paid_by_otherRow = findRowByValue(sheet, "Paid_by_other");

  // Insert other payments below "Paid by Others"
  insertValuesBelowRow(sheet, Paid_by_otherRow, other_paid);

  var Received_by_otherRow = findRowByValue(sheet, "Received_by_other");

  // Insert other payments below "Received by Others"
  insertValuesBelowRow(sheet, Received_by_otherRow, other_received);

  firstTime = true;
  populatePayments();
  firstTime = false;

}

function check_subcriptions() {

  // check which subscriptions have been paid last month and which account payments are still outstanding
  // we assume the outstanding payments will be made this month and therefore add them to next month's amount prediction
  let LastMonthData = splitLastMonth();
  let payments = LastMonthData[0];
  let balance = LastMonthData[1];
  let subscriptions = list_accounts()[1];

  let hasbeenpaidMap = {};
  let accountPaymentsMap = {};
  let hasnotbeenpaid = [];
  let otherpayments = [];

  // Count the nr of payments for each account
  var counts = {};  // Initialize the counts object
  for (let i in payments) {
    let payment = payments[i];
    let accountName = payment[0];
    let amount = payment[1];
    let description = payment[2] + ', account payment nr ' + (counts[accountName] || 1);
    counts[accountName] = (counts[accountName] || 1) + 1;  // Increase count for the account

    let key = `${accountName}-${description}`;  // We now use the account name and description to form the key

    // Check if account with this description exists in the subscriptions list
    if (subscriptions.some(account => account === accountName)) {
        // If the account and description combination exists in the hasbeenpaidMap map,
        // we add the current amount to the existing one. Otherwise, we create a new entry.
        if (hasbeenpaidMap[key]) {
          hasbeenpaidMap[key].amount += parseFloat(amount);
        } else {
          hasbeenpaidMap[key] = { accountName, amount: parseFloat(amount), description };
        }
        
        // Store the payment in the accountPaymentsMap
        if (accountPaymentsMap[accountName]) {
          accountPaymentsMap[accountName].push([description, parseFloat(amount)]);
        } else {
          accountPaymentsMap[accountName] = [[description, parseFloat(amount)]];
        }
    } else {
        // Add this payment to the otherpayments list as it doesn't match any account in the list
        otherpayments.push(payment);

        // Also update the accountPaymentsMap to include otherpayments
        if (accountPaymentsMap[accountName]) {
          accountPaymentsMap[accountName].push([description, parseFloat(amount)]);
        } else {
          accountPaymentsMap[accountName] = [[description, parseFloat(amount)]];
        }
    }
  }

  // Check which subscriptions have not been paid
  for (let i in subscriptions) {
    let account = subscriptions[i];

    if (!accountPaymentsMap[account]) {
      hasnotbeenpaid.push(account);
    }
  }

  // Convert the paid subcriptions map to an array
  let hasbeenpaid = [];
  for (let key in hasbeenpaidMap) {
    let payment = hasbeenpaidMap[key];
    hasbeenpaid.push([payment.accountName, payment.amount.toString(), payment.description]);
  }

  // Sum of all payments
  let AccountBalanceDifference = payments.reduce((total, payment) => total + parseFloat(payment[1]), 0);

  // Sum of all other payments
  let totalOtherPaymentsAmount = otherpayments.reduce((total, payment) => total + parseFloat(payment[1]), 0);

  // Sum of all expected payments
  let totalPaidAmount = Object.values(hasbeenpaidMap).reduce((total, payment) => total + payment.amount, 0);

  if (enableLogging) {
    Logger.log("The nr of subscriptions are: " + subscriptions.length + "\n");
    for (i in subscriptions) {
      Logger.log(subscriptions[i] + "\n");
    }
    Logger.log("That have not been paid: " + hasnotbeenpaid.length + "\n");
    for (i in hasnotbeenpaid) {
      Logger.log(hasnotbeenpaid[i] + "\n");
    }
    Logger.log("The the difference in account balance...: " + AccountBalanceDifference);
    Logger.log("...is the other payments...:" + totalOtherPaymentsAmount);
    Logger.log("...plus what we expected to pay: " + totalPaidAmount);
    Logger.log("These are the other payments: ");
    for (i in otherpayments) {
      Logger.log(otherpayments[i] + "\n");
    }
    // Logger.log("This is what the account payments map looks like: " + JSON.stringify(accountPaymentsMap, null, 2));
  }

  if (Math.abs((AccountBalanceDifference - totalOtherPaymentsAmount) - totalPaidAmount) < 0.001) {
    return [hasbeenpaid, hasnotbeenpaid, accountPaymentsMap, otherpayments, AccountBalanceDifference, balance];
  } else {
    Logger.log("Error: The sum of all payments minus other payments does not match the sum of accounted payments.");
  }
}

function populatePayments() {
  if (firstTime) {
  // Fetch all the full months of payments that we have for the year so far and write them to the sheet in the rows belonging to the accounts
  // The month of January starts at column C
    var currentDate = new Date();
    var lastDayLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
    var payments = BUNQIMPORT_prod().filter(payment => {
      var paymentDate = new Date(payment.Payment.created);
      return paymentDate <= lastDayLastMonth;
    });
  }
  else {
  // get previous month's payments and check whether we paid what we expected to pay
    var payments = getPaymentsLastMonth(BUNQIMPORT_prod());
    enableLogging = false;
    checked_subscriptions = check_subcriptions();
    var paymentsmap = checked_subscriptions[2];
    var hasnotbeenpaid = checked_subscriptions[1];
    var AccountBalanceDifference = checked_subscriptions[4];
    var balance = checked_subscriptions[5];
    enableLogging = true;
  }

  // for all payments, check with month they belong to
  // then check which account they belong to
  // then write the amount to the right cell
  // and add the description as a note to the cell
  // for multiple payments to the same account in the same month, add the amounts together, and concat the descriptions

  // initialize arrays to keep track of accounts with multiple payments (paid and/or received)
  var passed = [];
  var paid_pass = [];
  var received_pass = [];

  for (var i=0;i<payments.length;i++) {
    let date = new Date(payments[i].Payment.created);
    var month = date.getMonth();
    var account = payments[i].Payment.counterparty_alias.display_name;
    var amount = payments[i].Payment.amount.value;
    var description = payments[i].Payment.description;
    var received = [];
    var paid = [];

    // if both paid and received total amounts for the account were already written once to the sheet continue to the next iteration of the loop
    if (passed.includes(account)) {
      continue;
    }

    // and if the account is not in the column of known accounts in the sheet
    if (list_accounts()[0].includes(account) == false) {
      // and if it's been received
      if (parseFloat(amount) > 0) {
        var Received_by_otherRow = findRowByValue(sheet, "Received_by_other");
        // Insert new accounts below "Received by Others"
        received.push(account);
        if (enableWrite) {insertValuesBelowRow(sheet, Received_by_otherRow, received);}
      }
      else {
        var Paid_by_otherRow = findRowByValue(sheet, "Paid_by_other");
        // Insert new accounts below "Paid by Others"
        paid.push(account);
        if (enableWrite) {insertValuesBelowRow(sheet, Paid_by_otherRow, paid);}
      }
    }

    // write the payments for the corresponding month
    if (months.includes(month)) {
      var col_nr = months.indexOf(month) + 3;
      // then find the corresponding row for the account
      // if it's been received, looks for values below "Received"
      if (parseFloat(amount) > 0) {
        var receivedRow = findRowByValue(sheet, "Received");
        // if there is none return any row above (we might have only received money from a service provider (subcription))
        if (findRowByValue(sheet, account, receivedRow) > 0) {
          var row_nr = findRowByValue(sheet, account, receivedRow);
          // Logger.log(account+" is in row "+row_nr)
        }
        else {
          var row_nr = findRowByValue(sheet, account);
        }
      }
      else {  
        var row_nr = findRowByValue(sheet, account);
      }

      var cell = sheet.getRange(row_nr, col_nr);
      var value = cell.getValue();

      var multiplepayments = paymentsmap[account].length > 1;

      if (value == "") { 
        if (firstTime) {
        cell.setNumberFormat("€0.00")
        cell.setValue(parseFloat(amount));
        cell.setNote(description);
        }
        else { // unexpected payment
        if (multiplepayments) {
          if (!paid_pass.includes(account) && parseFloat(amount) < 0) {
            [amount, description] = processPayments(account, paymentsmap, -1, paid_pass);
            // and if there are no positive payments for this account in the paymentsmap, also add the account to the received_pass array
            if (paymentsmap[account].every(payment => payment[1] < 0)) {
              received_pass.push(account);
            }
          } else if (!received_pass.includes(account) && parseFloat(amount) > 0) {
            [amount, description] = processPayments(account, paymentsmap, 1, received_pass);
            // and if there are no negative payments for this account in the paymentsmap, also add the account to the paid_pass array
            if (paymentsmap[account].every(payment => payment[1] > 0)) {
              paid_pass.push(account);
            }
          }          
        }
        if (enableLogging){
          if (amount > 0) {
            Logger.log(account + " paid us " + amount);
          }
          else {
            Logger.log("We paid " + amount + " to " + account);
          }
          Logger.log("We did not expect this payment!");
          }
        if (enableWrite) {
          cell.setNumberFormat("€0.00")
          cell.setValue(parseFloat(amount)); 
          cell.setBackground("#f9cb9c"); // set it to a light orange color
          cell.setNote("We did not expect this payment! \nDescriptions:\n" + description);
        }

        }
      }
      else {
        if (firstTime) {
        var new_value = parseFloat(value) + parseFloat(amount);
        cell.setNumberFormat("€0.00")
        cell.setValue(new_value);
        cell.setNote(cell.getNote() + "\n" + description);
        }
        else {
        if (multiplepayments) {
          if (!paid_pass.includes(account) && parseFloat(amount) < 0) {
            [amount, description] = processPayments(account, paymentsmap, -1, paid_pass);
            // and if there are no positive payments for this account in the paymentsmap, also add the account to the received_pass array
            if (paymentsmap[account].every(payment => payment[1] < 0)) {
              received_pass.push(account);
            }
          } else if (!received_pass.includes(account) && parseFloat(amount) > 0) {
            [amount, description] = processPayments(account, paymentsmap, 1, received_pass);
            // and if there are no negative payments for this account in the paymentsmap, also add the account to the paid_pass array
            if (paymentsmap[account].every(payment => payment[1] > 0)) {
              paid_pass.push(account);
            }
          }          
        }

        let expected = parseFloat(value);
        let actual = parseFloat(amount);

        if (amount > 0) {
          if (enableLogging){Logger.log(account + " paid us " + amount);}
          if (expected > 0) {
            var difference = expected - actual;
          }
          else {
            var difference = expected + actual;
          }
        }
        else {
          if (enableLogging){Logger.log("We paid " + amount + " to " + account);}
          if (expected > 0) {
            var difference = expected + actual;
          }
          else {
            var difference = actual - expected;
          }
        }

        if (Math.abs(difference) < 0.1) {
          if (enableLogging){Logger.log("We were correct because the difference is: "+ expected +" versus "+ actual+" = "+difference);}
          if (enableWrite) {
            cell.setBackground("d4f3bd"); // set it to a light green color
            cell.setNote("\nDescriptions:\n" + description);
            cell.setValue(actual)
            }
          }
        else {
          if (enableLogging){Logger.log("We were wrong because the difference is: "+expected+" versus "+actual+" = "+difference);}
          if (enableWrite) {
            cell.setBackground("#f3bdbd"); // set it to a light red color
            cell.setNote("The difference is: \n"+difference + "\nDescriptions:\n" + description);
            cell.setValue(actual)
            }
          }     
        }
      }
      if ([paid_pass, received_pass].every(pass => pass.includes(account))) { // if both paid and received total amounts for the account were already written once to the sheet
      // add account to passed array
      passed.push(account);
      // Logger.log("The accounts with multiple payments (negative and/or positive) that have passed are: "+passed)
      }
    }
  }
  
  // also update the sheet to reflect missing payments from the previous month

  let unique_hasnotbeenpaid = new Set(hasnotbeenpaid)
  var missingpayments = [];

  for (let i in unique_hasnotbeenpaid) {
    let account = unique_hasnotbeenpaid[i];
    cell = sheet.getRange(findRowByValue(sheet, account), months.indexOf(thismonth) + 3 -1);
    expected = parseFloat(cell.getValue());
    if (enableLogging) {Logger.log(account + " has not been paid " + expected);}
    missingpayments.push([account, expected]);
    if (enableWrite) {
      cell.setBackground("#cff3ef"); // set it to a light cyan color
      cell.setNote("We expected to pay: \n" + expected);
      cell.setValue(0);
    }
  }

  // finally write the account balance and difference to the sheet
  if (enableLogging) {
    Logger.log("The account balance at the end of previous month is: " + balance);
    Logger.log("The change in account balance is: " + AccountBalanceDifference)
  }
  if (enableWrite) {
    sheet.getRange(findRowByValue(sheet, "Account Balance"), months.indexOf(thismonth) + 3 -1).setValue(balance);
    sheet.getRange(findRowByValue(sheet, "Difference"), months.indexOf(thismonth) + 3 -1).setValue(AccountBalanceDifference);
  }
}

function write_previousmonth() {
  enableWrite = true;
  populatePayments();
  enableWrite = false;
}

function predictThisMonth() {
  // This predicts what salaries have to be paid to cover expenses this month

  // Note: Before running this function, you can enter amounts manually in the sheet if you expect different amounts than previous month
  //       A service provider might have charged extra or less exclusively this month.
  //       You might also expect different amounts in the coming months that you can manually enter.

  var col_nr = months.indexOf(thismonth) + 3 - 1;

  // for each value in the column (col_nr) between the PaidRow and the ReceivedRow (those are the subscriptions)
  // check if the cell next to it has value and if not, fill it with the same value as the previous month

  var paidRow = findRowByValue(sheet, "Paid");
  var receivedRow = findRowByValue(sheet, "Received");

  for (var i=paidRow;i<receivedRow;i++) {
    var value = sheet.getRange(i, col_nr).getValue();
    var next_value = sheet.getRange(i, col_nr + 1).getValue();
    if (value != "" && next_value == "") {
      var cell = sheet.getRange(i, col_nr + 1);
      cell.setNumberFormat("€0.00");
      cell.setValue(value);
    }
  }

  // for each account that was not paid last month, add the amount to this month's prediction
  enableLogging = false;
  var hasnotbeenpaid = check_subcriptions()[1];
  enableLogging = true;

  for (let i in hasnotbeenpaid) {
    let account = hasnotbeenpaid[i];
    let cell = sheet.getRange(findRowByValue(sheet, account), col_nr + 1);
    let prediction = cell.getValue();
    let missingpayment = sheet.getRange(findRowByValue(sheet, account), col_nr).getNote().split("We expected to pay: \n")[1];
    let new_value = parseFloat(missingpayment) + parseFloat(prediction);
    cell.setNumberFormat("€0.00");
    cell.setValue(new_value);
  }

  // sum the column of this month's predictions
  // then compare the account balance to the desired buffer amount
  // and detract it from the sum of this month's predictions
  // divide the result by the people (under the salaries tab) making advance payments
  // write the advance payments to the correct cells 

}
// right now the predictThisMonth functions immediately writes the predictions
// but it would be nice to get an email with an overview of last months payments... (using Gmail API)
// ...and next month's predictions in order to verify that the script ran correctly
// and take some manual actions if necessary

function writeThisMonth() {  
  enableWrite = true;
  predictThisMonth();
  enableWrite = false;
  }

// pay the amount for next month

function makePayment(amount) {
  var sessionToken = createNewSession();

  var url = 'https://api.bunq.com/v1/user/' + getUserDetail('User payment account number') + '/monetary-account/' + getUserDetail('Monetary payment account number'); // Replace with your user id and monetary account id
  var options = {
    method: 'POST',
    headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'User-Agent': 'postman',
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'nl_NL',
    'X-Bunq-Client-Request-Id': getUserDetail('X-Bunq-Client-Request-Id'),
    'X-Bunq-Geolocation': '0 0 0 0 000',
    'X-Bunq-Client-Authentication': sessionToken,
    'X-Bunq-Client-Signature': getUserDetail('X-Bunq-Client-Signature')
    },
    payload: JSON.stringify({
      amount: {
        value: amount.toString(),
        currency: 'EUR'
      },
      counterparty_alias: {
        type: 'IBAN',
        value: sheet.getRange(3,2).getValue(), // get the IBAN and name from the sheet (fill in manually in the API tab)
        name: sheet.getRange(2,2).getValue()
      },
      description: 'advance payment',
      allow_bunqme: false
    })
  };
  
  var response = UrlFetchApp.fetch(url, options);
  var data = JSON.parse(response.getContentText());
  
  return data.Response[1].Payment;
  }