import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PetCardsPage } from './pet-cards.page';

describe('PetCardsPage', () => {
  let component: PetCardsPage;
  let fixture: ComponentFixture<PetCardsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PetCardsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
