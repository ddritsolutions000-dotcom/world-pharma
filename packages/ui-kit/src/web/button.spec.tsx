import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';
import { FormField, Input } from './forms';
import { ThemeProvider } from './theme';

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider defaultTheme="light">{ui}</ThemeProvider>);
}

describe('Button', () => {
  it('renders variants and blocks presses while loading', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    wrap(
      <Button variant="primary" loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: /save/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('FormField', () => {
  it('associates label, input, and error', () => {
    wrap(
      <FormField label="Email" error="Enter a valid email" required>
        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} invalid />}
      </FormField>,
    );
    const input = screen.getByLabelText(/email/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email');
  });
});
