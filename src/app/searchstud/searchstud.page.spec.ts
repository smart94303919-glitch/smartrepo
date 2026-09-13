import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchstudPage } from './searchstud.page';

describe('SearchstudPage', () => {
  let component: SearchstudPage;
  let fixture: ComponentFixture<SearchstudPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SearchstudPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
