function checkRecurringPayments(payment, allPayments) {

    var paymentDate = resetTime(new Date(payment.Payment.created));
    // var paymentAmount = parseFloat(payment.Payment.amount.value);
    var paymentCounterparty = payment.Payment.counterparty_alias.display_name;
  
    var twoMonthsAgo = resetTime(new Date(paymentDate.getFullYear(), paymentDate.getMonth() - 2, paymentDate.getDate()));
    var lastMonth = resetTime(new Date(paymentDate.getFullYear(), paymentDate.getMonth() - 1, paymentDate.getDate()));
  
    var similarPayments = allPayments.filter(otherPayment => {
      var otherDate = new Date(otherPayment.Payment.created);
    //   var otherAmount = parseFloat(otherPayment.Payment.amount.value);
      var otherCounterparty = otherPayment.Payment.counterparty_alias.display_name;

      // There is some tweaking with the following logic:
      // We assume that the payments are made regularly on the same day of the month
      // But they can be made up to 3 days earlier or later
      var isWithinDateRange = (otherDate >= new Date(twoMonthsAgo.getTime() - (3*86400000)) && otherDate <= new Date(lastMonth.getTime() + (3*86400000)));
 // This was another tryout to give a range to the date regularity: 
 // && (Math.abs((otherDate.getDate() - paymentDate.getDate())) <= 7)
      var isSameCounterparty = paymentCounterparty === otherCounterparty;
    // This logic is quite restrictive because in my experience the amounts vary often, even with basic subscriptions:  
    // var isSameAmount = paymentAmount === otherAmount;
  
      return isWithinDateRange && isSameCounterparty // && isSameAmount;
    });
  
    return similarPayments.length >= 2;
}
  
function Classify() {
    var subscriptions = [];
    var salaries = [];
    var other_paid = [];
    var other_received = [];
    payments = BUNQIMPORT_prod();
    var paymentsLastMonth = getPaymentsLastMonth(payments);
  
    // this logic does the following: 
    // 1. get all payments from last month
    // 2. for each payment, check if there are at least 2 similar payments (to or from the same account) in the last 2 months
    // 3. if there are, add the counterparty to the list of subscriptions or salaries

    paymentsLastMonth.forEach(payment => {
        if (checkRecurringPayments(payment, payments)) {
            var isReceived = parseFloat(payment.Payment.amount.value) > 0;
            var counterparty = payment.Payment.counterparty_alias.display_name;
            if (isReceived) {
                salaries.push(counterparty);
                // Logger.log("Added salary: " + counterparty);
            } else {
                subscriptions.push(counterparty);
                // Logger.log("Added subscription: " + counterparty);
            }
        } else {
            var isReceived = parseFloat(payment.Payment.amount.value) > 0;
            if (isReceived) {
                other_received.push(payment.Payment.counterparty_alias.display_name);
            } else {
                other_paid.push(payment.Payment.counterparty_alias.display_name);
            }
            // Logger.log("Not recurring: " + payment.Payment.counterparty_alias.display_name);
        }
    });

    // Logger.log("Salaries: " + salaries);
    // Logger.log("Subscriptions: " + subscriptions);

    // Remove duplicates from the lists
    salaries = [...new Set(salaries)];
    subscriptions = [...new Set(subscriptions)];
    other_paid = [...new Set(other_paid)];
    other_received = [...new Set(other_received)];

    return [subscriptions, salaries, other_paid, other_received];
}