import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SectionsComponent } from './sections.component';

describe('SectionsComponent', () => {
  let fixture: ComponentFixture<SectionsComponent>;
  let component: SectionsComponent;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    router = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [IonicModule.forRoot(), SectionsComponent],
      providers: [{ provide: Router, useValue: router }]
    }).compileComponents();

    fixture = TestBed.createComponent(SectionsComponent);
    component = fixture.componentInstance;
  });

  it('routes to student registration with the selected section when the add button is pressed', () => {
    component.onRegisterStudent({
      sectionName: 'BSIT-1',
      subjects: [{ SubjectID: 101, subject: 'Math' }]
    } as any);

    expect(router.navigate).toHaveBeenCalledWith(['/studentreg'], {
      queryParams: { section: 'BSIT-1' }
    });
  });
});
