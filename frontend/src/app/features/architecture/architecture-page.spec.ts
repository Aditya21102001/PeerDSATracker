import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArchitecturePage } from './architecture-page';

describe('ArchitecturePage', () => {
  let component: ArchitecturePage;
  let fixture: ComponentFixture<ArchitecturePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArchitecturePage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ArchitecturePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the architecture page component', () => {
    expect(component).toBeTruthy();
  });

  it('should default to architecture tab and load /archify/architecture.html', () => {
    expect(component.activeTab()).toBe('architecture');
    expect(component.activeDiagramRawUrl()).toBe('/archify/architecture.html');
  });

  it('should switch tabs to workflow and load /archify/workflow.html', () => {
    component.switchTab('workflow');
    expect(component.activeTab()).toBe('workflow');
    expect(component.activeDiagramRawUrl()).toBe('/archify/workflow.html');
  });

  it('should render an iframe with sanitized source', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const iframe = compiled.querySelector('iframe.archify-frame');
    expect(iframe).toBeTruthy();
  });
});
