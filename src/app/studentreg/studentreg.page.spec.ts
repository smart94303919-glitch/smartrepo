import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule, AlertController } from '@ionic/angular';
import { StudentregPage } from './studentreg.page';

describe('StudentregPage', () => {
  let component: StudentregPage;
  let fixture: ComponentFixture<StudentregPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IonicModule.forRoot(), StudentregPage],
      providers: [AlertController]
    }).compileComponents();

    fixture = TestBed.createComponent(StudentregPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show a confirmation alert before registering a student', async () => {
    const alert = jasmine.createSpyObj('HTMLIonAlertElement', ['present']);
    spyOn(component['alertCtrl'], 'create').and.resolveTo(alert);

    await component.showRegistrationConfirmation();

    expect(component['alertCtrl'].create).toHaveBeenCalled();
    expect(alert.present).toHaveBeenCalled();
  });

  it('should accept age 17 without showing an invalid-age warning', () => {
    spyOn(component['toastCtrl'], 'create');

    component.onAgeInput(new CustomEvent('ionInput', { detail: { value: 17 } }));

    expect(component['toastCtrl'].create).not.toHaveBeenCalled();
  });

  it('should not reject age 17 during registration submission validation', async () => {
    const alert = jasmine.createSpyObj('HTMLIonAlertElement', ['present']);
    spyOn(component['alertCtrl'], 'create').and.resolveTo(alert);
    component.student.age = 17;

    await component.onSubmit();

    expect(component['alertCtrl'].create).toHaveBeenCalled();
    expect(alert.present).toHaveBeenCalled();
  });
});
