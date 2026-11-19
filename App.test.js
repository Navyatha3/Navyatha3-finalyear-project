import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

test('renders fusedchat header', () => {
  render(<App />);
  const heading = screen.getByText(/fusedchat/i);
  expect(heading).toBeInTheDocument();
});
