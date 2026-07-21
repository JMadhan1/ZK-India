pragma circom 2.1.0;

include "circomlib/circuits/comparators.circom";

/*
 * ZKGate India — Date helpers
 *
 * Age from a date of birth, computed entirely inside the circuit.
 *
 * The only subtlety here is the birthday boundary. A naive
 * `age = current_year - dob_year` overstates the age of anyone whose birthday
 * has not yet come round this year, which would let a 17-year-old born in
 * December prove they are 18 in the preceding January. So we work out whether
 * the birthday has already passed and subtract a year if it has not.
 */

// Emits 1 if (month, day) has already been reached in the current year.
template BirthdayPassed() {
    signal input current_month;
    signal input current_day;
    signal input dob_month;
    signal input dob_day;

    signal output passed;   // 1 if birthday has occurred on/before the current date

    // current_month > dob_month  -> birthday is behind us regardless of day
    component month_gt = GreaterThan(8);
    month_gt.in[0] <== current_month;
    month_gt.in[1] <== dob_month;

    // current_month == dob_month -> it comes down to the day
    component month_eq = IsEqual();
    month_eq.in[0] <== current_month;
    month_eq.in[1] <== dob_month;

    // On the birthday itself the person IS the new age, hence >= not >
    component day_gte = GreaterEqThan(8);
    day_gte.in[0] <== current_day;
    day_gte.in[1] <== dob_day;

    // month_gt and month_eq are mutually exclusive, so the sum is still boolean.
    passed <== month_gt.out + month_eq.out * day_gte.out;
}

// Age in whole years. Inputs are assumed already range-checked by the caller.
template AgeInYears() {
    signal input dob_year;
    signal input dob_month;
    signal input dob_day;
    signal input current_year;
    signal input current_month;
    signal input current_day;

    signal output age;

    component bday = BirthdayPassed();
    bday.current_month <== current_month;
    bday.current_day   <== current_day;
    bday.dob_month     <== dob_month;
    bday.dob_day       <== dob_day;

    signal year_diff <== current_year - dob_year;

    // Not had the birthday yet this year => one year younger than the year gap.
    age <== year_diff - (1 - bday.passed);
}

/*
 * Rejects nonsense dates.
 *
 * This matters more than it looks. Every comparator below is built on Num2Bits,
 * which only behaves for inputs inside its bit width. A date of birth in the
 * future makes `current_year - dob_year` negative, and a negative number in a
 * prime field is an enormous positive one — precisely the shape of input an
 * attacker would reach for. Range-checking the raw fields first means such a
 * witness cannot be built at all.
 */
template ValidDate() {
    signal input year;
    signal input month;
    signal input day;

    // 1900 <= year <= 2100
    component year_lo = GreaterEqThan(12);
    year_lo.in[0] <== year;
    year_lo.in[1] <== 1900;
    year_lo.out === 1;

    component year_hi = LessEqThan(12);
    year_hi.in[0] <== year;
    year_hi.in[1] <== 2100;
    year_hi.out === 1;

    // 1 <= month <= 12
    component month_lo = GreaterEqThan(8);
    month_lo.in[0] <== month;
    month_lo.in[1] <== 1;
    month_lo.out === 1;

    component month_hi = LessEqThan(8);
    month_hi.in[0] <== month;
    month_hi.in[1] <== 12;
    month_hi.out === 1;

    // 1 <= day <= 31
    component day_lo = GreaterEqThan(8);
    day_lo.in[0] <== day;
    day_lo.in[1] <== 1;
    day_lo.out === 1;

    component day_hi = LessEqThan(8);
    day_hi.in[0] <== day;
    day_hi.in[1] <== 31;
    day_hi.out === 1;
}
