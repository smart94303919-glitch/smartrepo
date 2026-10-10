import { TemplateFormComponent, recommendColumns } from './template-form.component';

describe('recommendColumns', () => {
  it('chooses one, three, and four columns for increasing four-choice layouts', () => {
    expect(recommendColumns(20, 4)).toBe(1);
    expect(recommendColumns(60, 4)).toBe(3);
    expect(recommendColumns(100, 4)).toBe(4);
  });

  it('returns null when the question count and choice pitch cannot fit', () => {
    expect(recommendColumns(60, 9)).toBeNull();
  });

  it('returns null for invalid inputs', () => {
    expect(recommendColumns(0, 4)).toBeNull();
    expect(recommendColumns(20, 1)).toBeNull();
  });
});

describe('TemplateFormComponent column mode', () => {
  function createComponent(): TemplateFormComponent {
    return new TemplateFormComponent({} as any, {} as any, {} as any, {} as any, {} as any);
  }

  it('updates columns when the question count changes in automatic mode', () => {
    const component = createComponent();
    component.model.total_questions = 20;
    component.onQuestionCountChange();

    expect(component.isAutoColumns).toBeTrue();
    expect(component.model.columns).toBe(1);
  });

  it('recalculates when the choices count changes in automatic mode', () => {
    const component = createComponent();
    component.model.total_questions = 60;
    component.onQuestionCountChange();
    component.onOptionsChange(9);

    expect(component.automaticColumnRecommendation).toBeNull();
  });

  it('preserves a manual column selection when the question count changes', () => {
    const component = createComponent();
    component.setManualColumns(true);
    component.model.columns = 2;
    component.model.total_questions = 20;
    component.onQuestionCountChange();

    expect(component.isAutoColumns).toBeFalse();
    expect(component.model.columns).toBe(2);
    expect(component.isManualColumnLayoutValid).toBeTrue();
  });

  it('marks a manual layout invalid when it cannot fit the page', () => {
    const component = createComponent();
    component.setManualColumns(true);
    component.model.total_questions = 60;
    component.model.columns = 1;

    expect(component.isManualColumnLayoutValid).toBeFalse();
  });
});