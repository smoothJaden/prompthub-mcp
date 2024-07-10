let input = document.querySelector(".number-input"); // Get input element
let keys = document.querySelectorAll(".num"); // Get calculator buttons
let calcus = ""; // A variable that stores each button values
let operator = ""; // A variable that stores each Operator values (+, -, *, /)
let oldValue = ""; // This variable stores the first value inputed ()
let newValue = ""; // This stores the values after the operators have been clicked 
// if you have 12 + 3, 12 is the "oldValue" and 3 is the newValue

//Iterate through each keys to get access to each individual calculator btn
keys.forEach((number, index) => {
  input.value = ""; // set the value of input to empty cancelling the initial value thats "0"
  if ((index >= 4 && index <= 12) || index === 14) { // Targets (1, 2, 3, 4, 5, 6, 7, 8, 9, and 0)
    number.addEventListener("click", () => { // assign an event to target buttons, the event takes each "textContent" of a button and assign them them to the input.value element
      calcus = number.textContent; // assign the textContent of each button to calcus variable
      input.value += calcus; // display the textContent on Input element
      newValue += calcus; // appends the textContent to newValue variable
    });
  } else if (index === 13) { //Handles decimal (Prevents the input from accepting more than 1 decimals )
    number.addEventListener("click", () => { 
      if (!newValue.includes(".")) { //iterate through newValue, if a decimal is not present, it appends a decimal to the "newValue" variable
        calcus = number.textContent; // assign the decimal to calcus
        input.value += calcus; //display "." on the input element
        newValue += calcus; // appends "." to the newVlue variable
      }
    });
  } else if (index === 15) { // Handles "C" clearing all store data
    number.addEventListener("click", () => { //handles eventlistening on the "C"
      input.value = ""; // Reset input to empty string
      oldValue = ""; // Reset oldValue to empty string
      newValue = ""; // Reset the Newvalue to an empty string
      operator = ""; // Reset the Operator to an empty string
    });
  } else if (index === 16) { //Handles the "=" Button
    number.addEventListener("click", () => { //Handles getting the final result of our calculation
      try {
        let result; // This Variable stores the variable based on the operator used
        switch (operator) {  // Handle getting the final result based on the operator assigned to it
          case "+": //if operator value = + "add"
            result = parseFloat(oldValue) + parseFloat(newValue); //divide oldValue from newValue 
            break;
          case "-"://if operator value = - "minus"
            result = parseFloat(oldValue) - parseFloat(newValue); //divide oldValue from newValue 
            break;
          case "*"://if operator value = * "multiply"
            result = parseFloat(oldValue) * parseFloat(newValue); //divide oldValue from newValue 
            break;
          case "/"://if operator value = / "division"
            result = parseFloat(oldValue) / parseFloat(newValue); // divide oldValue from newValue 
            break;
          default: // else choose the code is an error and abort
            result = "Error"; // if no operator is assigned, or code encounters an error, display this 
            break;
        }
        input.value = result; // display this value on our input element
        oldValue = ""; // Reset oldvalue 
        newValue = ""; //Reset newvalue 
      } catch (error) { // If code encounters any issue, or code is 
        input.value = "Error"; // If error exist, display error on the input element
        oldValue = ""; // reset Oldvalue
        newValue =""; // reset new value
      }
    });
  } else if (index >= 0 && index <= 3) {//handles our operator (+, -, / *)
    number.addEventListener("click", () => { // handles event listening on the each operator clicked
      operator = number.textContent; //Assigns the textContent to a our operator value
      oldValue = newValue; // assign the value of "newValue" to our empty Oldvalue variable
      newValue = ""; // reset newValue variable to be empty, making it easier to assign a new value after the operator is clicked
      input.value = ""; // reset input element to be empty
    });
  }
});

// That is project in all entirety was created by Iyeke benjamin 
// feel free to check and please let me know if theres any improvements youll like me to work on