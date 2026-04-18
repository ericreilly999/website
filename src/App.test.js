import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import About from './pages/About';
import Projects from './pages/Projects';

global.IS_REACT_ACT_ENVIRONMENT = true;

function renderComponent(Component) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Component />);
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('About page', () => {
  test('renders the updated resume summary and contributions', () => {
    const { container, unmount } = renderComponent(About);

    expect(container.textContent).toContain('Senior Cloud Architect and SRE leader with 7+ years');
    expect(container.textContent).toContain('Togetherwork | Nov 2025 - Present');
    expect(container.textContent).toContain('Reduced SLA-impacting incidents by 53%');

    unmount();
  });
});

describe('Projects page', () => {
  test('renders all five GitHub projects with repo links', () => {
    const { container, unmount } = renderComponent(Projects);

    const projectCards = container.querySelectorAll('.project-card');

    expect(projectCards).toHaveLength(5);
    expect(container.textContent).toContain('Paused proof of concept');
    expect(container.textContent).toContain('AI Assistant MVP Scaffold');
    expect(container.textContent).toContain('Pokemon Tuxedo');
    expect(container.textContent).toContain('Personal Website');
    expect(container.textContent).toContain('Prompted: Tech Talks');
    expect(container.textContent).toContain('Why I Built This');
    expect(container.textContent).toContain('Personal brand matters a lot now');
    expect(container.querySelector('a[href="https://github.com/ericreilly999/inventory"]')).not.toBeNull();

    unmount();
  });
});
