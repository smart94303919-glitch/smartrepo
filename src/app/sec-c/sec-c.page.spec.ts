import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SecCPage } from './sec-c.page';

describe('SecCPage', () => {
  let component: SecCPage;
  let fixture: ComponentFixture<SecCPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SecCPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
