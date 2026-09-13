import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CoedpPage } from './coedp.page';

describe('CoedpPage', () => {
  let component: CoedpPage;
  let fixture: ComponentFixture<CoedpPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CoedpPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
