import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PetRegistrationPage } from './pet-registration.page';

describe('PetRegistrationPage', () => {
  let component: PetRegistrationPage;
  let fixture: ComponentFixture<PetRegistrationPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PetRegistrationPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
