import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SecDPage } from './sec-d.page';

describe('SecDPage', () => {
  let component: SecDPage;
  let fixture: ComponentFixture<SecDPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SecDPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
