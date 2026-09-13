import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SecAPage } from './sec-a.page';

describe('SecAPage', () => {
  let component: SecAPage;
  let fixture: ComponentFixture<SecAPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SecAPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
