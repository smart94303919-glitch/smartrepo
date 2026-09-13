import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SecBPage } from './sec-b.page';

describe('SecBPage', () => {
  let component: SecBPage;
  let fixture: ComponentFixture<SecBPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SecBPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
