// This contains helper functions for
// 1. Google Sheets
// 2. the BUNQ API
// 3. the classifier and predictor


// 1. Helper functions for Google Sheets

function customLogger(message) {
  Logger.log(message); // Log message to the Google Apps Script dashboard
  if (enableMail) {
    logMessages.push(message); // Add new message to the array
  }
}

function findRowByValue(sheet, value, startingRow) {
    if (startingRow === undefined) {
      startingRow = 0;
    }
    var columnB = sheet.getRange("B:B").getValues();
    for (var i = startingRow; i < columnB.length; i++) {
      if (columnB[i][0] === value) {
        return i + 1; // +1 because array indices start at 0 while rows start at 1
      }
    }
    return -1; // not found
}

function list_accounts() { 
  // Get all the account names below "Paid"
  // Exclude the names "Received, Paid_by_other, Received_by_other" or empty cells "" because they are not accounts
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var accounts = [];
  var paidRow = findRowByValue(sheet, "Paid");

  for (var i = paidRow; i < data.length; i++) {
    if (data[i][1] != "Received" && data[i][1] != "Paid_by_other" && data[i][1] != "Received_by_other" && data[i][1] != "") {
      accounts.push(data[i][1]);
    }
  }

  var subscriptions = [];
  var receivedRow = findRowByValue(sheet, "Received");

  for (var i = paidRow; i < receivedRow -1; i++) {
    if (data[i][1] != "") {
      subscriptions.push(data[i][1]);
    }
  }

  // Logger.log("The accounts are: " + accounts);

  return [accounts, subscriptions];
}

function columnNumberToLetter(columnNumber) {
    var div = Math.floor(columnNumber / 26);
    var mod = columnNumber % 26;
    var letter = String.fromCharCode(65 + mod);
    if (div > 0) {
      letter = columnNumberToLetter(div - 1) + letter;
    }
    return letter;
  }

function get_col_nr(ofmonth) {
  // <<< get the column to which to write >>>
  var col_nr = 0
  var month = 13
  for (var i=1;i<sheet.getLastColumn();i++) {
    var value = sheet.getRange(4, i).getValue(); // go through the row where the dates of the month are
    if (typeof value == "object") {
        var month = value.getMonth()
        var monthName = getMonthName(month);
    }
    if (month == ofmonth) {
        col_nr = i
        var col_letter = columnNumberToLetter(col_nr - 1);
        Logger.log("The month we are writing for is: "+monthName)
        Logger.log("The column number/letter is: "+col_letter)
    }
  }
  return col_nr
}

function getMonthName(month) {
  var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return monthNames[month];
}
  
function insertValuesBelowRow(sheet, row, values) {
  for (var i = 0; i < values.length; i++) {
    sheet.insertRowAfter(row);
    sheet.getRange(row + 1, 2).setValue(values[i]); // 2 is column B
    row++;
  }
}

// 2. Helper functions for the BUNQ API

// This gets the details of the user and their bank account for making API calls
function getUserDetail(key) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("API");
  var data = sheet.getDataRange().getValues();
  
  for (var i = 0; i < data.length; i++) {
    if (data[i].includes(key)) {
      return data[i][data[i].indexOf(key) + 1];
    }
  }
  
  return null; // Return null if the key is not found
}

// This opens a new session to make API calls
// An installation needs to be made first (with postman is easiest) and the API headers need to be added to the sheet
function createNewSession() {
    var url = 'https://api.bunq.com/v1/session-server';
    var headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'User-Agent': 'postman',
      'X-Bunq-Language': 'en_US',
      'X-Bunq-Region': 'nl_NL',
      'X-Bunq-Client-Request-Id': getUserDetail("X-Bunq-Client-Request-Id"),
      'X-Bunq-Geolocation': '0 0 0 0 000',
      'X-Bunq-Client-Authentication': getUserDetail("X-Bunq-Client-Authentication"),
      'X-Bunq-Client-Signature': getUserDetail("X-Bunq-Client-Signature"),
    };
    var payload = JSON.stringify({
      'secret': getUserDetail("secret"),
    });
    var options = {
      method: 'POST',
      headers: headers,
      payload: payload,
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() == 200) {
      var data = JSON.parse(response.getContentText());
      Logger.log(data.Response[1].Token.token)
      return data.Response[1].Token.token;
    } else {
      Logger.log('Error: ' + response.getContentText());
      return null;
    }
  }

function BUNQIMPORT_prod() { 
  // get the year from the name of the tab
  var currentDate = new Date();
  var currentYear = currentDate.getFullYear().toString();
  var sessionToken = createNewSession();
  var count = 200; // Number of items per page (max)
  var payments = []; // Array to hold all payments
  var firstpayment = new Date();
  var lastpayment = new Date();
  var nextPageUrl = 'https://api.bunq.com/v1/user/' + getUserDetail('User number') + '/monetary-account/' + getUserDetail('Monetary account number') + '/payment?count=' + count;

  while (nextPageUrl) { // Continue fetching pages as long as nextPageUrl is not null
    // Logger.log("Fetching page: " + nextPageUrl);
    var response = UrlFetchApp.fetch(
      nextPageUrl, {
        'headers': {
          'X-Bunq-Client-Authentication': sessionToken 
        }
      }
    );

    // Delay to comply with rate limiting (1000 ms delay for simplicity, adjust as needed)
    Utilities.sleep(1000);

    var data = JSON.parse(response.getContentText());
    var pagePayments = data.Response; // Assuming each page has a Response property containing the payments
    var paginationInfo = data.Pagination; // Extract Pagination object

    // Stop if the last payment date is before January 1, 2023
    var stopFetching = false;  // flag to indicate whether to stop fetching
    var cutoffIndex = -1;  // index of the last payment to keep

    for (var i = 0; i < pagePayments.length; i++) {
        var paymentDate = new Date(pagePayments[i].Payment.created);
        // set flag to true if a payment dated before January 1, year = name of the sheet, is found
        // and if the first and last payment are at least three months apart (in case we start in the first two months of the year)
        // Logger.log(firstpayment.getMonth() - paymentDate.getMonth()) // some debugging
        var firstpaymentTotalMonths = firstpayment.getFullYear() * 12 + firstpayment.getMonth(); // calculate total nr of months since a fixed point in time
        var paymentDateTotalMonths = paymentDate.getFullYear() * 12 + paymentDate.getMonth(); // to be able to calculate the difference

        if (paymentDate < new Date(currentYear+'-01-01T00:00:00') && (firstpaymentTotalMonths - paymentDateTotalMonths >= 3)) { // for some reason during the final loop the difference of the months becomes -2 during testing
            stopFetching = true;  
            cutoffIndex = i - 1;  // update the cutoff index to the index of the previous payment
            // Logger.log("It breaks at" + paymentDate);
            break;  // exit the for loop
        }
    }
    if (cutoffIndex >= 0) {
      pagePayments = pagePayments.slice(0, cutoffIndex + 1);  // keep only the payments from the beginning of the array up to the cutoff index
    }
    payments = payments.concat(pagePayments); // Merge page payments with the main payments array
    var firstpayment = new Date(payments[0].Payment.created)
    // Logger.log("The first payment is: " + firstpayment);

    if (stopFetching) {
        break;  // exit the while loop if stopFetching flag is true
    }
    nextPageUrl = paginationInfo && paginationInfo.newer_url ? 'https://api.bunq.com' + paginationInfo.newer_url : null; // Update nextPageUrl
  }

  // some debugging
  // log the first and last payment data and the month with a linebreak
  // var lastpayment = new Date(payments[payments.length - 1].Payment.created)
  // Logger.log(firstpayment + "\n and the number:" + firstpayment.getMonth());
  // Logger.log(lastpayment + "\n and the number:" + lastpayment.getMonth());
  // Logger.log(firstpayment.getMonth() - lastpayment.getMonth());
  return payments; // Return all fetched payments
}

function splitLastMonth() { 
  var data = getPaymentsLastMonth(BUNQIMPORT_prod());
  var payments = [];

  for (i in data) {
    payments.push([data[i].Payment.counterparty_alias.display_name, data[i].Payment.amount.value, data[i].Payment.description])
    }

  var balance = parseFloat(data[0].Payment.balance_after_mutation.value); // this is the account balance after the last payment of the month
  // Logger.log(payments) // debugging
  return [payments, balance]
}

function processPayments(account, paymentsmap, threshold, passArray) {
  let totalAmount = paymentsmap[account].reduce((total, payment) => {
    if ((threshold < 0 && parseFloat(payment[1]) < 0) || (threshold > 0 && parseFloat(payment[1]) > 0)) {
      return total + parseFloat(payment[1]);
    }
    return total;
  }, 0);

  let descriptions = paymentsmap[account].filter(payment => (threshold < 0 && parseFloat(payment[1]) < 0) || (threshold > 0 && parseFloat(payment[1]) > 0)).map(payment => payment[0]).join(", ");

  passArray.push(account);

  return [totalAmount, descriptions];
}

// 3. Helper functions for classifier and predictor

function getPaymentsLastMonth(payments) {
  var currentDate = new Date();
  var firstDayLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  var lastDayLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);

  return payments.filter(payment => {
    var paymentDate = new Date(payment.Payment.created);
    return paymentDate >= firstDayLastMonth && paymentDate <= lastDayLastMonth;
  });
}

function resetTime(date) {
  date.setHours(0, 0, 0, 0);
  return date;
}