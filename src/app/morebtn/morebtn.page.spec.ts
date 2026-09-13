import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MorebtnPage } from './morebtn.page';

describe('MorebtnPage', () => {
  let component: MorebtnPage;
  let fixture: ComponentFixture<MorebtnPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MorebtnPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
