import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PetDetailsPage } from './pet-details.page';

describe('PetDetailsPage', () => {
  let component: PetDetailsPage;
  let fixture: ComponentFixture<PetDetailsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PetDetailsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
