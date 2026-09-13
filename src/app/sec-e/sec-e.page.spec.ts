import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SecEPage } from './sec-e.page';

describe('SecEPage', () => {
  let component: SecEPage;
  let fixture: ComponentFixture<SecEPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SecEPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
