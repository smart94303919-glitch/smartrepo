import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CmbtpPage } from './cmbtp.page';

describe('CmbtpPage', () => {
  let component: CmbtpPage;
  let fixture: ComponentFixture<CmbtpPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CmbtpPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
