import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('exposes a named card region', () => {
    render(
      <Card
        semanticType="reflection"
        title="What I learned"
        excerpt="Small steps count."
      />,
    );

    expect(screen.getByRole('article', { name: 'What I learned' })).toBeVisible();
  });

  it('renders actions in a named group', () => {
    render(
      <Card
        actions={<button type="button">Open</button>}
        semanticType="uncharted"
        title="A possible path"
      />,
    );

    expect(screen.getByRole('group', { name: 'Actions for A possible path' })).toBeVisible();
  });
});
