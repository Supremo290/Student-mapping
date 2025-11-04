import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-date-picker',
  templateUrl: './date-picker.component.html',
  styleUrls: ['./date-picker.component.scss']
})
export class DatePickerComponent implements OnInit {
  examDays: { date: Date | null, am: boolean, pm: boolean }[] = [];
  maxDays = 5;

  minDate!: Date;
  maxDate!: Date;

  constructor(
    public dialogRef: MatDialogRef<DatePickerComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  ngOnInit() {
    const currentYear = new Date().getFullYear();
    this.minDate = new Date(currentYear, 0, 1);
    this.maxDate = new Date(2035, 11, 31);

    // preload previously selected dates
   if (this.data && this.data.selectedDates && this.data.selectedDates.length) {
      this.examDays = this.data.selectedDates.map((d: string) => ({
        date: new Date(d),
        am: true,
        pm: true
      }));
    } else {
      this.examDays = [{ date: null, am: false, pm: false }];
    }
  }

  addDay() {
    if (this.examDays.length < this.maxDays) {
      this.examDays.push({ date: null, am: false, pm: false });
    }
  }

  removeDay(index: number) {
    this.examDays.splice(index, 1);
  }

  cancel() {
    this.dialogRef.close();
  }

  save() {
    const validDays = this.examDays.filter(d => d.date instanceof Date);
    this.dialogRef.close(validDays);
  }

  /** Disable already selected dates in other rows */
  dateFilter = (date: Date | null): boolean => {
    if (!date) return true;

    const selectedDates = this.examDays
      .map(d => d.date instanceof Date ? d.date.toDateString() : null)
      .filter(d => d !== null);

    return !selectedDates.includes(date.toDateString());
  };
}
