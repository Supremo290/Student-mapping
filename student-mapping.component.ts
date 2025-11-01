import { Component, OnInit } from '@angular/core';
import { ApiService } from '../api.service';
import { GlobalService } from '../global.service';
import { map } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { SubjectGroup, DepartmentGroup, ProgramSchedule } from '../subject-code';

@Component({
  selector: 'app-student-mapping',
  templateUrl: './student-mapping.component.html',
  styleUrls: ['./student-mapping.component.scss']
})
export class StudentMappingComponent implements OnInit {

  rawCodes: any[] = [];
  codes: any[] = [];
  subjectId: string;

  // master list containing ALL programs (including SAS) — used for logic
  programsAll: ProgramSchedule[] = [];

  // displayed list (filtered, excludes SAS) — bound to the template
  programs: ProgramSchedule[] = [];

  activeTerm: string;
  startDate: Date | null = null;
  selectedDates: string[] = [];
  daysWithTimeSlots: { [day: string]: string[] } = {};

  timeSlots: string[] = [
    '7:30 AM-9:00 AM', '9:00 AM-10:30 AM', '10:30 AM-12:00 PM', '12:00 PM-1:30 PM',
    '1:30 PM-3:00 PM', '3:00 PM-4:30 PM', '4:30 PM-6:00 PM', '6:00 PM-7:30 PM'
  ];
  displayedColumns: string[] = ['program', ...this.timeSlots];

  termOptions = [
    { key: 1, value: '1st Term' },
    { key: 2, value: '2nd Term' },
    { key: 3, value: 'Summer' },
  ];

  combinedOptions: { label: string, value: string }[] = [];
  departments: DepartmentGroup[] = [];
  swal = Swal;

  // store previous selection for a fullSlot (day_slot) before the user changes it
  prevSelection: { [fullSlot: string]: string } = {};

  selectedScheduleOutput: any[] = [];

  constructor(public api: ApiService, public global: GlobalService) {}

  ngOnInit() {
    this.combineYearTerm();
  }

  combineYearTerm() {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 1; y <= currentYear + 1; y++) {
      const nextYear = y + 1;
      for (let i = 0; i < this.termOptions.length; i++) {
        const t = this.termOptions[i];
        const label = `${t.value} ${y}-${nextYear}`;
        const value = `${y}${nextYear.toString().slice(-2)}${t.key}`;
        this.combinedOptions.push({ label: label, value: value });
      }
    }
  }

  // DATE PICKER handler
  onDateSelect(event: any) {
    if (!event || !event.value) return;
    const selected = event.value.toLocaleDateString('en-CA'); // yyyy-mm-dd
    if (!this.selectedDates.includes(selected)) {
      this.selectedDates.push(selected);
      this.daysWithTimeSlots[selected] = [...this.timeSlots];

      // initialize keys on programsAll for this date
      const prefix = selected + '_';
      for (let i = 0; i < this.programsAll.length; i++) {
        const p = this.programsAll[i];
        if (!p.schedule) p.schedule = {};
        for (let j = 0; j < this.timeSlots.length; j++) {
          const full = prefix + this.timeSlots[j];
          if (typeof p.schedule[full] === 'undefined') p.schedule[full] = '';
        }
      }

      // refresh displayed list (SAS filter)
      this.programs = this.programsAll.filter(function(p) { return !(p.dept && p.dept.toUpperCase() === 'SAS'); });
      this.updateSelectedScheduleOutput();
      // update counters for the new date
      this.updateRemainingSubjectsForAll(selected);
    }
  }

  removeDate(day: string) {
    this.selectedDates = this.selectedDates.filter(d => d !== day);
    delete this.daysWithTimeSlots[day];
    // Also remove any schedule keys for this day in programsAll
    const prefix = day + '_';
    for (const p of this.programsAll) {
      if (p.schedule) {
        const keys = Object.keys(p.schedule);
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          if (key.indexOf(prefix) === 0) delete p.schedule[key];
        }
      }
    }
    // Refresh displayed list
    this.programs = this.programsAll.filter(function(p) { return !(p.dept && p.dept.toUpperCase() === 'SAS'); });
    this.updateSelectedScheduleOutput();
  }

  selectTermYear() {
    if (!this.activeTerm) {
      this.global.swalAlertError("Please select term");
      return;
    }
    this.loadSwal();
    this.getCodeSummaryReport(this.activeTerm);
    console.log('Selected term-year value:', this.activeTerm);
  }

  getCodeSummaryReport(sy) {
    this.api.getCodeSummaryReport(sy)
      .map(function(response: any) { return response.json(); })
      .subscribe(
        res => {
          this.rawCodes = res.data;
          Swal.close();
          this.codes = this.getUniqueSubjectIds(res.data);

          // build master list and displayed (filtered) list
          const allPrograms = this.getUniqueProgramsAll(res.data);
          this.programsAll = allPrograms;                         // master list
          this.programs = this.programsAll.filter(function(p) {   // displayed list (exclude SAS)
            return !(p.dept && p.dept.toUpperCase() === 'SAS');
          });

          // ensure schedule map initialized (flat keys like "yyyy-mm-dd_7:30 AM-9:00 AM")
          // don't pre-create all date_slot keys — create when date is added
          for (let i = 0; i < this.programsAll.length; i++) {
            const p = this.programsAll[i];
            if (!p.schedule) p.schedule = {};
            p.remainingSubjects = this.getRemainingSubjects(p);
          }

          this.updateSelectedScheduleOutput();
        },
        err => {
          this.global.swalAlertError(err);
        }
      );
  }

  getUniqueSubjectIds(data: any[]): SubjectGroup[] {
    const groupedID: SubjectGroup[] = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const existing = groupedID.find(function(s) { return s.subjectId === item.subjectId; });
      if (existing) {
        existing.codes.push({
          codeNo: item.codeNo,
          course: item.course,
          year: item.yearLevel,
          dept: item.dept
        });
      } else {
        groupedID.push({
          subjectId: item.subjectId,
          subjectTitle: item.subjectTitle,
          codes: [{
            codeNo: item.codeNo,
            course: item.course,
            year: item.yearLevel,
            dept: item.dept
          }]
        });
      }
    }
    return groupedID;
  }

  getUniqueProgramsAll(data: any[]): ProgramSchedule[] {
    const groupedProg: ProgramSchedule[] = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const existingProgram = groupedProg.find(function(p) {
        return p.program === item.course && p.year === item.yearLevel;
      });

      const subjectData = {
        subjectId: item.subjectId,
        subjectTitle: item.subjectTitle,
        codeNo: item.codeNo
      };

      if (existingProgram) {
        const exists = existingProgram.subjects.find(function(s) {
          return s.subjectId === subjectData.subjectId;
        });
        if (!exists) existingProgram.subjects.push(subjectData);
      } else {
        groupedProg.push({
          program: item.course,
          year: item.yearLevel,
          dept: item.dept,
          subjects: [subjectData],
          schedule: {},               // flat map of "date_slot" -> subjectId
          remainingSubjects: 0
        });
      }
    }

    // stable sorting
    groupedProg.sort(function(a, b) {
      if (a.program < b.program) return -1;
      if (a.program > b.program) return 1;
      return Number(a.year) - Number(b.year);
    });

    return groupedProg;
  }

  // capture previous selected value for a fullSlot (before change occurs)
  capturePrev(prog: ProgramSchedule, fullSlot: string) {
    const prev = (prog.schedule && prog.schedule[fullSlot]) ? prog.schedule[fullSlot] : '';
    this.prevSelection[fullSlot] = prev;
  }

  // build global availability using programsAll so hidden SAS entries are respected
  getAvailableSubjects(prog: ProgramSchedule, fullSlot: string) {
    const selectedSubjectIds = new Set<string>();
    for (let i = 0; i < this.programsAll.length; i++) {
      const p = this.programsAll[i];
      const vals = Object.values(p.schedule || {});
      for (let j = 0; j < vals.length; j++) {
        const v: any = vals[j];
        if (v) selectedSubjectIds.add(v);
      }
    }

    const currentSelected = prog.schedule && prog.schedule[fullSlot] ? prog.schedule[fullSlot] : '';
    return prog.subjects.filter(function(subj) {
      return !selectedSubjectIds.has(subj.subjectId) || subj.subjectId === currentSelected;
    });
  }

  // (slot, day) -> fullSlot key
  onSubjectSelect(prog: ProgramSchedule, slot: string, day: string) {
    const fullSlot = day + '_' + slot;
    const selectedId = prog.schedule && prog.schedule[fullSlot] ? prog.schedule[fullSlot] : '';

    // UNSELECT (user cleared select)
    if (!selectedId) {
      // try to get previous id from prevSelection first
      const previousSubjectId = this.prevSelection[fullSlot] || (() => {
        // fallback: scan programsAll for any non-empty value for that fullSlot
        for (let i = 0; i < this.programsAll.length; i++) {
          const p = this.programsAll[i];
          if (p.schedule && p.schedule[fullSlot]) return p.schedule[fullSlot];
        }
        return '';
      })();

      if (previousSubjectId) {
        // Clear that subject across ALL programs for this fullSlot
        for (let i = 0; i < this.programsAll.length; i++) {
          const p = this.programsAll[i];
          if (p.schedule && p.schedule[fullSlot] === previousSubjectId) {
            p.schedule[fullSlot] = '';
          }
        }
      }

      // refresh displayed programs (filter SAS)
      this.programs = this.programsAll.filter(function(p) { return !(p.dept && p.dept.toUpperCase() === 'SAS'); });

      // clear prevSelection entry
      delete this.prevSelection[fullSlot];

      // update counters for this day
      this.updateRemainingSubjectsForAll(day);

      this.updateSelectedScheduleOutput();
      return;
    }

    // PREVENT duplicate (global across programsAll)
    for (let i = 0; i < this.programsAll.length; i++) {
      const p = this.programsAll[i];
      const vals = Object.values(p.schedule || {});
      for (let j = 0; j < vals.length; j++) {
        if (vals[j] === selectedId) {
          // if this is not the same program + same fullSlot already holding it, it's a duplicate
          const sameProgramSameSlot = (p.program === prog.program && p.year === prog.year && p.schedule[fullSlot] === selectedId);
          if (!sameProgramSameSlot) {
            this.global.swalAlertError("This subject is already assigned in another slot.");
            // rollback
            if (prog.schedule) prog.schedule[fullSlot] = '';
            return;
          }
        }
      }
    }

    // ASSIGN to all programsAll that contain this subject
    for (let i = 0; i < this.programsAll.length; i++) {
      const p = this.programsAll[i];
      const sameSubj = p.subjects.find(function(s) { return s.subjectId === selectedId; });
      if (sameSubj) {
        if (!p.schedule) p.schedule = {};
        p.schedule[fullSlot] = selectedId;
      }
    }

    // refresh displayed programs (filter SAS)
    this.programs = this.programsAll.filter(function(p) { return !(p.dept && p.dept.toUpperCase() === 'SAS'); });

    // update counters for this day
    this.updateRemainingSubjectsForAll(day);

    this.updateSelectedScheduleOutput();
  }

  // recompute remainingSubjects for every displayed program for a given day
  updateRemainingSubjectsForAll(day: string) {
    for (let i = 0; i < this.programs.length; i++) {
      const p = this.programs[i];
      p.remainingSubjects = this.getRemainingSubjectsForDay(p, day);
    }
  }

  updateSelectedScheduleOutput() {
    this.selectedScheduleOutput = [];

    // group by date (selectedDates)
    for (let d = 0; d < this.selectedDates.length; d++) {
      const day = this.selectedDates[d];
      const programsForDay: any[] = [];
      for (let i = 0; i < this.programs.length; i++) {
        const p = this.programs[i];
        const subjArr: any[] = [];
        const keys = Object.keys(p.schedule || {});
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          if (key.indexOf(day + '_') === 0) {
            const subjId = p.schedule[key];
            if (subjId) {
              const subj = p.subjects.find(function(s) { return s.subjectId === subjId; });
              subjArr.push({
                subjectId: subj ? subj.subjectId : '',
                subjectTitle: subj ? subj.subjectTitle : '',
                codeNo: subj ? subj.codeNo : '',
                sched: key.replace(day + '_', '')
              });
            }
          }
        }
        programsForDay.push({ program: p.program, year: p.year, subjects: subjArr });
      }
      this.selectedScheduleOutput.push({ date: day, programs: programsForDay });
    }

    console.log('Updated Output Array:', this.selectedScheduleOutput);
  }

  // Corrected: counts assigned slots for the given day (keys starting with day + '_')
  getRemainingSubjectsForDay(prog: ProgramSchedule, day: string): number {
    const total = (prog.subjects || []).length;
    let assigned = 0;
    const keys = Object.keys(prog.schedule || {});
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.indexOf(day + '_') === 0 && prog.schedule[k]) assigned++;
    }
    return total - assigned;
  }

  // legacy support: returns overall remaining (for non-day contexts)
  getRemainingSubjects(prog: ProgramSchedule): number {
    const total = (prog.subjects || []).length;
    const assignedCount = Object.values(prog.schedule || {}).filter(function(v: any) { return v; }).length;
    return total - assignedCount;
  }

  saveSchedule() {
    console.log("Final Schedule Output:", this.selectedScheduleOutput);
    this.global.swalSuccess("Schedule saved successfully!");
  }

  loadSwal() {
    this.swal.fire({
      title: 'Loading',
      text: '',
      type: 'info',
      allowOutsideClick: false,
      allowEscapeKey: false,
      onOpen: function() {
        Swal.showLoading();
      }
    });
  }
}
