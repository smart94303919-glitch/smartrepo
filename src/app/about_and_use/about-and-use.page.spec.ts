import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AboutAndUsePage } from './about-and-use.page';

describe('AboutAndUsePage', () => {
  let component: AboutAndUsePage;
  let fixture: ComponentFixture<AboutAndUsePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AboutAndUsePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
