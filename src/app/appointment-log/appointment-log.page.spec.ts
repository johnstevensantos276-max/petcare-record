import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppointmentLogPage } from './appointment-log.page';

describe('AppointmentLogPage', () => {
  let component: AppointmentLogPage;
  let fixture: ComponentFixture<AppointmentLogPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AppointmentLogPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
