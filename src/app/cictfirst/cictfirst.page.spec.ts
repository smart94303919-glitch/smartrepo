import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CictfirstPage } from './cictfirst.page';

describe('CictfirstPage', () => {
  let component: CictfirstPage;
  let fixture: ComponentFixture<CictfirstPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CictfirstPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
